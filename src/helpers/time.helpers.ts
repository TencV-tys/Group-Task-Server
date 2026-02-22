// helpers/time.helpers.ts - COMPLETE FIXED VERSION
import { DayOfWeek } from '@prisma/client';

export class TimeHelpers {
  // Grace period in minutes
  static readonly GRACE_PERIOD_MINUTES = 30;
  
  // Penalty for submitting after grace period (percentage)
  static readonly LATE_SUBMISSION_PENALTY = 0.5; // 50% penalty
  
  /**
   * Check if submission is allowed based on assignment due date and time slot
   */
  static canSubmitAssignment(assignment: any, currentTime: Date = new Date()) {
    const dueDate = new Date(assignment.dueDate);
    const currentDate = currentTime;
    
    // Check if it's the due date
    if (dueDate.toDateString() !== currentDate.toDateString()) {
      return { 
        allowed: false, 
        reason: 'Not due date',
        dueDate: dueDate,
        currentDate: currentDate
      };
    }
    
    // If no time slot, allow any time on due date
    if (!assignment.timeSlot) {
      return { 
        allowed: true,
        willBePenalized: false,
        finalPoints: assignment.points,
        originalPoints: assignment.points
      };
    }
    
    // Parse time slot end time
    const endParts = assignment.timeSlot.endTime.split(':');
    const endHour = parseInt(endParts[0] || '0', 10);
    const endMinute = parseInt(endParts[1] || '0', 10);
    
    const endTime = new Date(dueDate);
    endTime.setHours(endHour, endMinute, 0, 0);
    
    // 30 minute grace period after end time
    const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
    
    // Submission opens 30 minutes before end time
    const submissionStart = new Date(endTime.getTime() - 30 * 60000);
    
    if (currentDate < submissionStart) {
      const timeUntilStart = submissionStart.getTime() - currentDate.getTime();
      return { 
        allowed: false, 
        reason: 'Submission not open yet',
        opensIn: Math.ceil(timeUntilStart / 60000), // minutes
        submissionStart,
        currentTime: currentDate,
        willBePenalized: false
      };
    }
    
    if (currentDate <= endTime) {
      // On-time submission
      const timeLeft = endTime.getTime() - currentDate.getTime();
      return { 
        allowed: true, 
        timeLeft: Math.ceil(timeLeft / 1000), // seconds
        gracePeriodEnd,
        currentTime: currentDate,
        willBePenalized: false,
        finalPoints: assignment.points,
        originalPoints: assignment.points
      };
    }
    
    if (currentDate <= gracePeriodEnd) {
      // Grace period submission (still allowed, no penalty)
      const timeLeft = gracePeriodEnd.getTime() - currentDate.getTime();
      return { 
        allowed: true, 
        timeLeft: Math.ceil(timeLeft / 1000), // seconds
        gracePeriodEnd,
        currentTime: currentDate,
        willBePenalized: false,
        finalPoints: assignment.points,
        originalPoints: assignment.points
      };
    }
    
    // After grace period - submission not allowed
    return { 
      allowed: false, 
      reason: 'Submission window closed',
      gracePeriodEnd,
      currentTime: currentDate,
      willBePenalized: true,
      originalPoints: assignment.points
    };
  }
  
  /**
   * Check if assignment was neglected (no submission within time window)
   */
  static isAssignmentNeglected(assignment: any, currentTime: Date = new Date()): boolean {
    // If already completed, not neglected
    if (assignment.completed) return false;
    
    const dueDate = new Date(assignment.dueDate);
    
    // Check if it's past the due date
    if (currentTime < dueDate) return false;
    
    // If no time slot, check if past due date
    if (!assignment.timeSlot) {
      return currentTime > dueDate;
    }
    
    // Parse time slot end time
    const endParts = assignment.timeSlot.endTime.split(':');
    const endHour = parseInt(endParts[0] || '0', 10);
    const endMinute = parseInt(endParts[1] || '0', 10);
    
    const endTime = new Date(dueDate);
    endTime.setHours(endHour, endMinute, 0, 0);
    
    // Grace period after end time
    const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
    
    // If current time is past grace period and assignment not completed, it's neglected
    return currentTime > gracePeriodEnd && !assignment.completed;
  }
  
  /**
   * Calculate penalty for neglected assignments
   * Returns negative points to deduct
   */
  static calculateNeglectPenalty(assignment: any): number {
    // Deduct full points for neglected assignments
    return -Math.abs(assignment.points);
  }
  
  /**
   * Get time left for submission in human-readable format
   */
  static getTimeLeftText(timeLeftSeconds: number) {
    if (timeLeftSeconds <= 0) return 'Expired';
    
    const hours = Math.floor(timeLeftSeconds / 3600);
    const minutes = Math.floor((timeLeftSeconds % 3600) / 60);
    const seconds = timeLeftSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  /**
   * Check if current time is within any of the task's time slots
   */
  static isWithinAnyTimeSlot(timeSlots: any[], currentTime: Date = new Date()) {
    if (!timeSlots || timeSlots.length === 0) return null;
    
    const currentInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    for (const slot of timeSlots) {
      const startParts = slot.startTime.split(':');
      const endParts = slot.endTime.split(':');
      
      const startHour = parseInt(startParts[0] || '0', 10);
      const startMinute = parseInt(startParts[1] || '0', 10);
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      const startInMinutes = startHour * 60 + startMinute;
      const endInMinutes = endHour * 60 + endMinute;
      
      // Check if current time is within the slot plus 30 minute grace period
      if (currentInMinutes >= startInMinutes && 
          currentInMinutes <= (endInMinutes + 30)) {
        return slot;
      }
    }
    
    return null;
  }
  
  /**
   * Get the next upcoming time slot
   */
  static getNextTimeSlot(timeSlots: any[], currentTime: Date = new Date()) {
    if (!timeSlots || timeSlots.length === 0) return null;
    
    const currentInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // Sort time slots by start time
    const sortedSlots = [...timeSlots].sort((a, b) => {
      const aStartParts = a.startTime.split(':');
      const bStartParts = b.startTime.split(':');
      
      const aStart = parseInt(aStartParts[0] || '0', 10) * 60 + 
                    parseInt(aStartParts[1] || '0', 10);
      const bStart = parseInt(bStartParts[0] || '0', 10) * 60 + 
                    parseInt(bStartParts[1] || '0', 10);
      return aStart - bStart;
    });
    
    // Find next slot
    for (const slot of sortedSlots) {
      const startParts = slot.startTime.split(':');
      const startHour = parseInt(startParts[0] || '0', 10);
      const startMinute = parseInt(startParts[1] || '0', 10);
      const startInMinutes = startHour * 60 + startMinute;
      
      if (startInMinutes > currentInMinutes) {
        return slot;
      }
    }
    
    // If no upcoming slots today, return first slot tomorrow
    return sortedSlots[0];
  }
  
  /**
   * Check if current time is within submission window for a specific time slot
   */
  static isWithinSubmissionWindow(timeSlot: any, currentTime: Date = new Date()): boolean {
    const endParts = timeSlot.endTime.split(':');
    const endHour = parseInt(endParts[0] || '0', 10);
    const endMinute = parseInt(endParts[1] || '0', 10);
    
    const currentInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const endInMinutes = endHour * 60 + endMinute;
    const submissionStartInMinutes = endInMinutes - 30;
    const graceEndInMinutes = endInMinutes + 30;
    
    return currentInMinutes >= submissionStartInMinutes && 
           currentInMinutes <= graceEndInMinutes;
  }
  
  /**
   * Get submission window information for a time slot
   */
  static getSubmissionWindowInfo(timeSlot: any, dueDate: Date) {
    const endParts = timeSlot.endTime.split(':');
    const endHour = parseInt(endParts[0] || '0', 10);
    const endMinute = parseInt(endParts[1] || '0', 10);
    
    const endTime = new Date(dueDate);
    endTime.setHours(endHour, endMinute, 0, 0);
    
    const submissionStart = new Date(endTime.getTime() - 30 * 60000);
    const gracePeriodEnd = new Date(endTime.getTime() + 30 * 60000);
    
    return {
      endTime,
      submissionStart,
      gracePeriodEnd,
      opensIn: this.getTimeUntil(submissionStart),
      closesIn: this.getTimeUntil(gracePeriodEnd)
    };
  }
  
  /**
   * Get time until a specific datetime
   */
  static getTimeUntil(targetDate: Date, currentTime: Date = new Date()): number | null {
    const diff = targetDate.getTime() - currentTime.getTime();
    if (diff <= 0) return null;
    return Math.ceil(diff / 1000); // return seconds
  }
  
  /**
   * Format a date to time string (HH:MM)
   */
  static formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  /**
   * Get current week boundaries
   */
  static getWeekBoundaries(weekOffset: number = 0): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate days to subtract to get to Monday (assuming week starts Monday)
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday + (weekOffset * 7));
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    return { weekStart, weekEnd };
  }
  
  /**
   * Get day of week from index
   */
  /**
 * Get day of week from index - CONCISE FIX
 */
static getDayOfWeekFromIndex(index: number): DayOfWeek {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
  const safeIndex = ((index % 7) + 7) % 7; // Handle negative indices
  return days[safeIndex] as DayOfWeek;
}
  
  
  /**
   * Calculate due date based on day of week
   */
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
    const currentDay = referenceDate.getDay();
    
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) {
      daysToAdd += 7;
    }
    
    const dueDate = new Date(referenceDate);
    dueDate.setDate(referenceDate.getDate() + daysToAdd);
    dueDate.setHours(0, 0, 0, 0);
    
    return dueDate;
  }
  
  /**
   * Validate time slot (end time after start time) - FIXED
   */
  static validateTimeSlot(startTime: string, endTime: string): boolean {
    // Split and parse start time with defaults
    const startParts = startTime.split(':');
    const startHourStr = startParts[0] || '0';
    const startMinuteStr = startParts[1] || '0';
    
    const startHour = parseInt(startHourStr, 10);
    const startMinute = parseInt(startMinuteStr, 10);
    
    // Split and parse end time with defaults
    const endParts = endTime.split(':');
    const endHourStr = endParts[0] || '0';
    const endMinuteStr = endParts[1] || '0';
    
    const endHour = parseInt(endHourStr, 10);
    const endMinute = parseInt(endMinuteStr, 10);
    
    // Validate that all values are valid numbers
    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
      return false;
    }
    
    // Validate hour ranges (0-23)
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      return false;
    }
    
    // Validate minute ranges (0-59)
    if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
      return false;
    }
    
    const startInMinutes = startHour * 60 + startMinute;
    const endInMinutes = endHour * 60 + endMinute;
    
    return endInMinutes > startInMinutes;
  }
  
  /**
   * Convert 12-hour time to 24-hour format
   */
  static convertTo24Hour(hour: string, minute: string, period: string): string {
    let hourNum = parseInt(hour, 10);
    
    if (period === 'PM' && hourNum !== 12) {
      hourNum += 12;
    } else if (period === 'AM' && hourNum === 12) {
      hourNum = 0;
    }
    
    return `${hourNum.toString().padStart(2, '0')}:${minute}`;
  }
  
  /**
   * Convert 24-hour time to 12-hour format
   */
  /**
 * Convert 24-hour time to 12-hour format - CONCISE WITH NULLISH COALESCING
 */
static convertTo12Hour(time24: string): { hour: string; minute: string; period: string } {
  const parts = time24?.split(':') ?? [];
  const hour24 = parts[0] ?? '0';
  const minute = parts[1] ?? '00';
  
  const hourNum = parseInt(hour24, 10);
  if (isNaN(hourNum)) {
    return { hour: '12', minute: '00', period: 'AM' };
  }
  
  const period = hourNum >= 12 ? 'PM' : 'AM';
  let hour12 = hourNum % 12;
  hour12 = hour12 === 0 ? 12 : hour12;
  
  return {
    hour: hour12.toString(),
    minute,
    period
  };
}
}