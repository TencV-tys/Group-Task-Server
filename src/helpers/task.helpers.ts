// helpers/task.helpers.ts - UPDATED with UTC methods

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

  // ✅ FIXED: Use UTC methods
  static getWeekBoundaries(weekOffset: number = 0): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const currentUTCDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Days to Monday (Monday = 1 in UTC)
    const daysToMonday = currentUTCDay === 0 ? 6 : currentUTCDay - 1;
    
    const weekStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysToMonday + (weekOffset * 7),
      0, 0, 0, 0
    ));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    
    console.log(`📅 getWeekBoundaries (UTC):`);
    console.log(`   Now UTC: ${now.toUTCString()}`);
    console.log(`   Current UTC day index: ${currentUTCDay}`);
    console.log(`   Days to Monday: ${daysToMonday}`);
    console.log(`   Week start UTC: ${weekStart.toUTCString()}`);
    console.log(`   Week end UTC: ${weekEnd.toUTCString()}`);
    
    return { weekStart, weekEnd };
  }

  // ✅ FIXED: Use UTC methods
  static calculateDueDate(day: DayOfWeek, referenceDate: Date = new Date()): Date {
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
    const currentUTCDay = referenceDate.getUTCDay();
    
    let daysToAdd = targetDay - currentUTCDay;
    if (daysToAdd < 0) {
      daysToAdd += 7;
    }
    
    const dueDate = new Date(Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() + daysToAdd,
      0, 0, 0, 0
    ));
    
    console.log(`📅 calculateDueDate (UTC):`);
    console.log(`   Target day: ${day} (map value: ${targetDay})`);
    console.log(`   Reference UTC date: ${referenceDate.toUTCString()}`);
    console.log(`   Current UTC day index: ${currentUTCDay}`);
    console.log(`   Days to add: ${daysToAdd}`);
    console.log(`   Result UTC: ${dueDate.toUTCString()}`);
    
    return dueDate;
  }

  // ✅ FIXED: Use UTC methods
  static getDayOfWeekFromIndex(index: number, weekStart?: Date): DayOfWeek {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
    
    if (weekStart) {
      // Calculate actual day based on week start (UTC)
      const weekStartUTCDay = weekStart.getUTCDay();
      const actualDayIndex = (weekStartUTCDay + index) % 7;
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
      if (!slot.startTime || !slot.endTime) {
        return { isValid: false, error: "Time slots must have both start and end times" };
      }
      
      if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
        return { isValid: false, error: `Invalid time format for slot: ${slot.startTime}-${slot.endTime}. Use HH:MM` };
      }

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
        calculatedSlots.push({
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: slot.label || undefined,
          points: 0
        });
      }
    }

    if (!hasCustomPoints) {
      const equalPoints = totalTaskPoints / timeSlots.length;
      const roundedPoints = Math.round(equalPoints * 2) / 2;
      
      let remainingPoints = totalTaskPoints;
      for (let i = 0; i < calculatedSlots.length; i++) {
        let points: number;
        if (i === calculatedSlots.length - 1) {
          points = remainingPoints;
        } else {
          points = roundedPoints;
          remainingPoints -= points;
        }
        calculatedSlots[i]!.points = Number(points.toFixed(1));
      }
      
      totalPointsUsed = totalTaskPoints;
    } else {
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