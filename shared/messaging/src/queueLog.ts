import fs from 'node:fs';
import path from 'node:path';

type Level = 'info' | 'error';

export class QueueLogger {
  private readonly dir: string;
  private readonly serviceName: string;

  constructor(logDir: string, serviceName: string) {
    this.dir = logDir;
    this.serviceName = serviceName;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  info(action: string, queue?: string | string[], details: Record<string, unknown> = {}): void {
    this.write('info', action, queue, details);
  }

  error(action: string, queue?: string | string[], details: Record<string, unknown> = {}): void {
    this.write('error', action, queue, details);
  }

  private write(
    level: Level,
    action: string,
    queue: string | string[] | undefined,
    details: Record<string, unknown>,
  ): void {
    const queues = queue === undefined ? [] : Array.isArray(queue) ? queue : [queue];
    const line =
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        service: this.serviceName,
        queue: queues[0] ?? null,
        action,
        ...details,
      }) + '\n';

    this.append('broker.log', line);
    for (const name of queues) this.append(`${safeQueueName(name)}.log`, line);
  }

  private append(file: string, line: string): void {
    fs.appendFileSync(path.join(this.dir, file), line);
  }
}

function safeQueueName(queue: string): string {
  return queue.replace(/[^a-zA-Z0-9._-]/g, '_');
}
