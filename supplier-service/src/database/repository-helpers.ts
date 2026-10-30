import {OpeningHours, PublicOpeningHours} from '@data/opening-hours-schema'
import { getSupplierByIdService } from './supplier-repository';

//make sure to declare this is a boolean

//NOT A REST endpoint yet. Just placed here
export async function isSupplierOpenService(id: number, at = new Date()): Promise<boolean> {
    const supplierRow = await getSupplierByIdService(id); // 404 if missing/deleted
    //already handles a 404 error and return never processes
    // compare `at`'s clock time to opensAt/closesAt
    return isOpenStatus(supplierRow.openingHours, 'Asia/Singapore', at).isOpen; //unwrap the boolean
  }
  


export function isOpenStatus(hours:PublicOpeningHours[], tz: string, at = new Date()): {isOpen: boolean} {

    const {dayOfWeek, minutes} = localParts(at, tz);
    const prevDay = (dayOfWeek + 6) % 7; //for supper stretch stores

    const isOpen = hours.some((h) => {
                                if (h.isClosed || h.opensAt == null || h.closesAt == null){
                                    return false;
                                }

                                const opens = toMinutes(h.opensAt);
                                const closes = toMinutes(h.closesAt);

                                const overnight = closes<=opens; 
                                
                                if (h.dayOfWeek === dayOfWeek) {
                                    return overnight ? minutes >= opens : minutes >= opens && minutes < closes;
                                  }
                                  // yesterday's overnight slot still running past midnight
                                  if (h.dayOfWeek === prevDay && overnight) return minutes < closes;
                                  
                                  return false;
                                });
                                
                                return {isOpen};
}

//helper for isOpen
function localParts(at: Date, tz: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23', // avoids the "24:00" quirk at midnight
    }).formatToParts(at);
  
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    const dayOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    return { dayOfWeek, minutes };
  }


//constant formatting here 
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':');
    return Number(h) * 60 + Number(m);
  };

