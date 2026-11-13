// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Live RabbitMQ/PostgreSQL consumer, redelivery and dead-letter tests; review pending.
// See ../../usage-log.md.
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const brokerUrl=process.env.TEST_RABBITMQ_URL;
test('Order consumes deletion events durably, deduplicates after restart and dead-letters invalid/conflicting input',{skip:!brokerUrl},async t=>{
 const dbUrl=process.env.TEST_DATABASE_URL;
 if(!dbUrl||!/^order_service_test(?:_[a-zA-Z0-9_]+)?$/.test(new URL(dbUrl).pathname.slice(1)))throw new Error('Use a dedicated Order test database');
 const parsed=new URL(brokerUrl);
 if(parsed.hostname!=='127.0.0.1'||parsed.port!=='5679')throw new Error('Use disposable RabbitMQ on 127.0.0.1:5679');
 const {PrismaClient}=require('../dist/generated/prisma');const db=new PrismaClient({datasourceUrl:dbUrl});
 const {startUserDeletedConsumer}=require('../dist/events/userDeleted');const {RabbitMQClient,QUEUES,deadLetterQueue}=require('@foc/messaging');
 const amqp=require('amqplib'),raw=await amqp.connect(brokerUrl),channel=await raw.createChannel();
 const userId='deletion-test-'+randomUUID();let consumer;
 const publisher=new RabbitMQClient({url:brokerUrl,serviceName:'test-producer',prefetch:1,logDir:'/tmp/order-deletion-test-logs'});
 t.after(async()=>{await consumer?.close();await publisher.close();await channel.close();await raw.close();await db.userDeletionEvent.deleteMany({where:{userId}});await db.$disconnect()});
 await db.$connect();await publisher.connect();consumer=await startUserDeletedConsumer(db,brokerUrl);
 const event={type:'user.deleted',eventId:randomUUID(),userId,occurredAt:'2026-11-02T00:00:00.000Z',deletedAt:'2026-11-02T00:00:00.000Z'};
 async function until(check){const deadline=Date.now()+5000;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,25))}throw new Error('Timed out waiting for consumer')}
 await Promise.all(Array.from({length:5},()=>publisher.publishToQueue(QUEUES.orderUser,event,event.eventId)));
 await until(async()=>await db.userDeletionEvent.count({where:{eventId:event.eventId}})===1);
 const stored=await db.userDeletionEvent.findUniqueOrThrow({where:{eventId:event.eventId}});assert.equal(stored.userId,userId);await until(async()=>(await db.userDeletionEvent.findUniqueOrThrow({where:{eventId:event.eventId}})).state==='PROCESSED');assert.equal(stored.deletedAt.toISOString(),event.deletedAt);
 await consumer.close();consumer=undefined;
 // Publish while Order is offline, then restart the consumer against the durable queue.
 await publisher.publishToQueue(QUEUES.orderUser,event,event.eventId);
 consumer=await startUserDeletedConsumer(db,brokerUrl);
 await publisher.publishToQueue(QUEUES.orderUser,{...event,eventId:randomUUID(),type:'user.restored'});
 await publisher.publishToQueue(QUEUES.orderUser,{...event,eventId:randomUUID(),type:'user.created'});
 const dlq=deadLetterQueue(QUEUES.orderUser);
 await publisher.publishToQueue(QUEUES.orderUser,{...event,deletedAt:'bad-date'},event.eventId);
 await until(async()=>(await channel.checkQueue(dlq)).messageCount>=1);
 const invalid=await channel.get(dlq,{noAck:false});assert.equal(JSON.parse(invalid.content.toString()).deletedAt,'bad-date');channel.ack(invalid);
 await publisher.publishToQueue(QUEUES.orderUser,{...event,deletedAt:'2026-11-01T00:00:00.000Z'},event.eventId);
 await until(async()=>(await channel.checkQueue(dlq)).messageCount>=1);
 const conflict=await channel.get(dlq,{noAck:false});assert.equal(JSON.parse(conflict.content.toString()).eventId,event.eventId);channel.ack(conflict);
 assert.equal(await db.userDeletionEvent.count({where:{userId}}),1);
 // Storage outage must exhaust shared retries into DLQ, never ACK as successful.
 await consumer.close();consumer=undefined;
 const unavailable={userDeletionEvent:{findMany:args=>db.userDeletionEvent.findMany(args),createMany:async()=>{throw new Error('Simulated database outage')}}};
 consumer=await startUserDeletedConsumer(unavailable,brokerUrl);
 const retry={...event,eventId:randomUUID()};await publisher.publishToQueue(QUEUES.orderUser,retry,retry.eventId);
 await until(async()=>(await channel.checkQueue(dlq)).messageCount>=1);
 const failed=await channel.get(dlq,{noAck:false});assert.equal(JSON.parse(failed.content.toString()).eventId,retry.eventId);assert.equal(failed.properties.headers['x-retry'],3);channel.ack(failed);
 assert.equal(await db.userDeletionEvent.count({where:{eventId:retry.eventId}}),0);
});
