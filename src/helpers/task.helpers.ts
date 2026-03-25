// helpers/task.helpers.ts
import { DayOfWeek } from '@prisma/client';

export class TaskHelpers {
  // Helper to safely parse JSON arrays
  static safeJsonParse<T>(value: any): T[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value) as T[];
    } catch {
      return [];
    }
  }

  // Helper to calculate week boundaries
  static getWeekBoundaries(weekOffset: number = 0): { weekStart: Date, weekEnd: Date } {
    const now = new Date();
    const currentDay = now.getDay();
    
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const monday = new Date(now);
    monday.setDate(monday.getDate() - daysToMonday + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return { weekStart: monday, weekEnd: sunday };
  }

// helpers/task.helpers.ts
static calculateDueDate(day: DayOfWeek, weekStart?: Date): Date {
  const daysMap: Record<DayOfWeek, number> = {
    'SUNDAY': 0,
    'MONDAY': 1,
    'TUESDAY': 2,
    'WEDNESDAY': 3,
    'THURSDAY': 4,
    'FRIDAY': 5,
    'SATURDAY': 6
  };
  
  const targetDay = daysMap[day];
  const baseDate = weekStart || new Date();
  const currentDay = baseDate.getDay();
  
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) {
    daysToAdd += 7;
  }
  
  const dueDate = new Date(baseDate);
  dueDate.setDate(baseDate.getDate() + daysToAdd);
  dueDate.setHours(0, 0, 0, 0);
  
  return dueDate;
}

// helpers/task.helpers.ts
static getDayOfWeekFromIndex(index: number, weekStart?: Date): DayOfWeek {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
  
  if (weekStart) {
    // Calculate actual day based on week start
    const weekStartDay = weekStart.getDay();
    const actualDayIndex = (weekStartDay + index) % 7;
    return days[actualDayIndex] as DayOfWeek;
  }
  
  // Fallback to simple index (keeps compatibility)
  const safeIndex = ((index % 7) + 7) % 7;
  return days[safeIndex] as DayOfWeek;
}

  // Helper to validate time slot points distribution
  static validateAndCalculateTimeSlotPoints(
    timeSlots: Array<{ startTime: string; endTime: string; label?: string; points?: string | number }>,
    totalTaskPoints: number
  ): { isValid: boolean; error?: string; calculatedSlots?: Array<{ startTime: string; endTime: string; label?: string; points: number }> } {
    if (!timeSlots || timeSlots.length === 0) {
      return { isValid: false, error: "Time slots are required" };
    }

    const calculatedSlots: Array<{ startTime: string; endTime: string; label?: string; points: number }> = [];
    let totalPointsUsed = 0;
    let hasCustomPoints = false;

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    
    for (const slot of timeSlots) {
      // Validate time format
      if (!slot.startTime || !slot.endTime) {
        return { isValid: false, error: "Time slots must have both start and end times" };
      }
      
      if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
        return { isValid: false, error: `Invalid time format for slot: ${slot.startTime}-${slot.endTime}. Use HH:MM` };
      }

      // Validate start time is before end time
      const start = new Date(`2000-01-01T${slot.startTime}`);
      const end = new Date(`2000-01-01T${slot.endTime}`);
      if (start >= end) {
        return { isValid: false, error: `Start time must be before end time: ${slot.startTime}-${slot.endTime}` };
      }

      if (slot.points !== undefined && slot.points !== '' && slot.points !== null) {
        const points = Number(slot.points);
        if (isNaN(points) || points < 0) {
          return { isValid: false, error: `Invalid points for time slot: ${slot.startTime}` };
        }
        calculatedSlots.push({
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: slot.label || undefined,
          points: points
        });
        totalPointsUsed += points;
        hasCustomPoints = true;
      } else {
        // Will calculate later
        calculatedSlots.push({
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: slot.label || undefined,
          points: 0
        });
      }
    }

    // If no custom points specified, distribute equally with 0.5 increments
    if (!hasCustomPoints) {
      const equalPoints = totalTaskPoints / timeSlots.length;
      
      // Round to nearest 0.5
      const roundedPoints = Math.round(equalPoints * 2) / 2;
      
      // Distribute points, adjusting for rounding
      let remainingPoints = totalTaskPoints;
      for (let i = 0; i < calculatedSlots.length; i++) {
        let points: number;
        if (i === calculatedSlots.length - 1) {
          points = remainingPoints;
        } else {
          points = roundedPoints;
          remainingPoints -= points;
        }
        calculatedSlots[i]!.points = Number(points.toFixed(1)); // Add non-null assertion
      }
      
      totalPointsUsed = totalTaskPoints;
    } else {
      // If custom points were specified, they must equal total task points
      if (Math.abs(totalPointsUsed - totalTaskPoints) > 0.01) {
        return { 
          isValid: false, 
          error: `Total time slot points (${totalPointsUsed.toFixed(1)}) must equal task points (${totalTaskPoints})` 
        };
      }
    }

    return { isValid: true, calculatedSlots };
  }

  // Helper to validate selected days
  static validateSelectedDays(days: any): DayOfWeek[] | undefined {
    if (!Array.isArray(days)) return undefined;
    
    const validDays = Object.values(DayOfWeek);
    const filtered = days.filter((day: string) => 
      validDays.includes(day as DayOfWeek)
    );
    
    return filtered.length > 0 ? filtered as DayOfWeek[] : undefined;
  }

  // Helper to get time slot label based on time
  static getTimeSlotLabel(startTime: string): string {
    if (!startTime) return 'Default';
    
    const hourStr = startTime.split(':')[0];
    if (!hourStr) return 'Default';
    
    const hour = parseInt(hourStr);
    if (isNaN(hour)) return 'Default';
    
    if (hour >= 5 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 14) return 'Lunch';
    if (hour >= 14 && hour < 18) return 'Afternoon';
    if (hour >= 18 && hour < 22) return 'Evening';
    return 'Night';
  }

  // Helper to parse number safely
  static safeParseNumber(value: any, defaultValue: number = 0): number {
    if (value === undefined || value === null) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }
} 