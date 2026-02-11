// helpers/time.helpers.ts - NEW FILE
import { DayOfWeek } from '@prisma/client';

export class TimeHelpers {
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
      return { allowed: true };
    }
    
    // Parse time slot end time
    const [endHour, endMinute] = assignment.timeSlot.endTime.split(':').map(Number);
    const endTime = new Date(dueDate);
    endTime.setHours(endHour, endMinute, 0, 0);
    
    // 30 minute grace period after end time
    const gracePeriodEnd = new Date(endTime.getTime() + 30 * 60000);
    
    // Submission opens 30 minutes before end time
    const submissionStart = new Date(endTime.getTime() - 30 * 60000);
    
    if (currentDate < submissionStart) {
      const timeUntilStart = submissionStart.getTime() - currentDate.getTime();
      return { 
        allowed: false, 
        reason: 'Submission not open yet',
        opensIn: Math.ceil(timeUntilStart / 60000), // minutes
        submissionStart,
        currentTime: currentDate
      };
    }
    
    if (currentDate <= gracePeriodEnd) {
      const timeLeft = gracePeriodEnd.getTime() - currentDate.getTime();
      return { 
        allowed: true, 
        timeLeft: Math.ceil(timeLeft / 1000), // seconds
        gracePeriodEnd,
        currentTime: currentDate
      };
    }
    
    return { 
      allowed: false, 
      reason: 'Submission window closed',
      gracePeriodEnd,
      currentTime: currentDate
    };
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
      const startInMinutes = parseInt(slot.startTime.split(':')[0]) * 60 + 
                            parseInt(slot.startTime.split(':')[1]);
      const endInMinutes = parseInt(slot.endTime.split(':')[0]) * 60 + 
                          parseInt(slot.endTime.split(':')[1]);
      
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
      const aStart = parseInt(a.startTime.split(':')[0]) * 60 + 
                    parseInt(a.startTime.split(':')[1]);
      const bStart = parseInt(b.startTime.split(':')[0]) * 60 + 
                    parseInt(b.startTime.split(':')[1]);
      return aStart - bStart;
    });
    
    // Find next slot
    for (const slot of sortedSlots) {
      const startInMinutes = parseInt(slot.startTime.split(':')[0]) * 60 + 
                            parseInt(slot.startTime.split(':')[1]);
      
      if (startInMinutes > currentInMinutes) {
        return slot;
      }
    }
    
    // If no upcoming slots today, return first slot tomorrow
    return sortedSlots[0];
  }
}