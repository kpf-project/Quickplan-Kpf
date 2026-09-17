import "server-only";

/**
 * Calculates the production date and shift based on a given timestamp.
 * Standard Logic:
 * - Shift 1: 06:01 - 19:00 (Current Date)
 * - Shift 2: 19:01 - 06:00 next day (Production Date is the day the shift started)
 * 
 * @param {Date|string} timestamp 
 * @returns {{ productionDate: string, shift: 1|2 }}
 */
export function calculateProductionShift(timestamp = new Date()) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  // Use Asia/Bangkok time for calculation
  const bangkokTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const hours = bangkokTime.getHours();
  const minutes = bangkokTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  let shift = 1;
  const productionDate = new Date(bangkokTime);
  
  if (timeInMinutes >= 361 && timeInMinutes <= 1140) {
    shift = 1;
  } else {
    shift = 2;
    // If it's between 00:00 and 06:00 (<= 360 minutes), the production date is the previous day
    if (timeInMinutes <= 360) {
      productionDate.setDate(productionDate.getDate() - 1);
    }
  }
  
  const year = productionDate.getFullYear();
  const month = String(productionDate.getMonth() + 1).padStart(2, "0");
  const day = String(productionDate.getDate()).padStart(2, "0");
  
  return {
    productionDate: `${year}-${month}-${day}`,
    shift,
  };
}

/**
 * Formats a shift number into a display label.
 * @param {number} shift 
 * @returns {string}
 */
export function formatShiftLabel(shift) {
  if (shift === 1) return "กะ1 [06:01 - 19:00]";
  if (shift === 2) return "กะ2 [19:01 - 06:00]";
  return `กะ ${shift}`;
}
