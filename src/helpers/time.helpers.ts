// helpers/time.helpers.ts - COMPLETE FIXED VERSION WITH PROPER TYPES
import { DayOfWeek } from '@prisma/client';

// Define return type for canSubmitAssignment
export interface CanSubmitResult {
  allowed: boolean;
  reason?: string;
  dueDate?: Date;
  currentDate?: Date;
  currentTime?: Date;
  willBePenalized?: boolean;
  finalPoints?: number;
  originalPoints?: number;
  timeLeft?: number;
  timeLeftText?: string;
  submissionStart?: Date;
  gracePeriodEnd?: Date;
  opensIn?: number; 
  opensAt?: Date;
   onTimeEnd?: Date;       
  lateWindowEnd?: Date; 
  activeSlot?: any;
  slotIndex?: number;
  submissionStatus?: string;
}

export class TimeHelpers {
  static readonly GRACE_PERIOD_MINUTES = 30;
  static readonly LATE_SUBMISSION_PENALTY = 0.5;

 // helpers/time.helpers.ts - CORRECTED timing

static canSubmitAssignment(assignment: any, currentTime: Date = new Date()): CanSubmitResult {
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
    
    // ✅ Submission opens AT end time
    const submissionStart = endTime;
    
    // ✅ On-time window: 0 to 25 minutes after end time
    const onTimeEnd = new Date(endTime.getTime() + 25 * 60000);
    
    // ✅ Late window: 25 to 30 minutes after end time (5 minutes)
    const lateWindowEnd = new Date(endTime.getTime() + 30 * 60000);
    
    // ✅ Grace period end (window closes)
    const gracePeriodEnd = lateWindowEnd;
    
    console.log(`⏰ Time check:`, {
      now: currentDate.toLocaleTimeString(),
      submissionStart: submissionStart.toLocaleTimeString(),
      onTimeEnd: onTimeEnd.toLocaleTimeString(),
      lateWindowEnd: lateWindowEnd.toLocaleTimeString(),
      endTime: endTime.toLocaleTimeString()
    });
    
    // BEFORE submission opens 
    if (currentDate < submissionStart) {
      const timeUntilStart = submissionStart.getTime() - currentDate.getTime();
      return { 
        allowed: false, 
        reason: 'Submission not open yet',
        opensIn: Math.ceil(timeUntilStart / 60000),
        submissionStart,
        currentTime: currentDate, 
        willBePenalized: false,
        activeSlot: null // ✅ Add activeSlot
      };
    }
    
    // ON TIME: Within first 25 minutes after end time
    if (currentDate <= onTimeEnd) {
      const timeLeft = onTimeEnd.getTime() - currentDate.getTime();
      return {  
        allowed: true, 
        timeLeft: Math.ceil(timeLeft / 1000),
        onTimeEnd,
        currentTime: currentDate,
        willBePenalized: false,
        finalPoints: assignment.points,
        originalPoints: assignment.points,
        submissionStatus: 'on_time',
        activeSlot: assignment.timeSlot // ✅ Add activeSlot
      };
    }
    
    // LATE: Within next 5 minutes (25-30 minutes after end time)
    if (currentDate <= lateWindowEnd) {
      const timeLeft = lateWindowEnd.getTime() - currentDate.getTime();
      return { 
        allowed: true, 
        timeLeft: Math.ceil(timeLeft / 1000),
        onTimeEnd,
        lateWindowEnd,
        currentTime: currentDate,
        willBePenalized: true,
        finalPoints: Math.floor(assignment.points * (1 - this.LATE_SUBMISSION_PENALTY)),
        originalPoints: assignment.points,
        submissionStatus: 'late',
        activeSlot: assignment.timeSlot // ✅ Add activeSlot
      };
    }
    
    // After 30 minutes - closed
    return { 
      allowed: false, 
      reason: 'Submission window closed',
      lateWindowEnd,
      currentTime: currentDate,
      willBePenalized: true,
      originalPoints: assignment.points,
      activeSlot: null // ✅ Add activeSlot
    };
  }
  

  static isAssignmentNeglected(assignment: any, currentTime: Date = new Date()): boolean {
    if (assignment.completed) return false;
    
    const dueDate = new Date(assignment.dueDate);
    
    if (currentTime < dueDate) return false;
    
    let timeSlotsToCheck: any[] = [];
    
    if (assignment.timeSlot) {
      timeSlotsToCheck = [assignment.timeSlot];
    } else if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0) {
      timeSlotsToCheck = assignment.task.timeSlots;
    }
    
    if (timeSlotsToCheck.length === 0) {
      return currentTime > dueDate;
    }
    
    const completedSlotIds: string[] = (assignment.completedTimeSlotIds as string[]) || [];
    const missedSlotIds: string[] = (assignment.missedTimeSlotIds as string[]) || [];
    const remainingSlots = timeSlotsToCheck.filter((slot: any) => 
      !completedSlotIds.includes(slot.id) && !missedSlotIds.includes(slot.id)
    );
    
    if (remainingSlots.length === 0) return false;
    
    for (const slot of remainingSlots) {
      if (!slot) continue;
      
      const endParts = slot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      const endTime = new Date(dueDate);
      endTime.setHours(endHour, endMinute, 0, 0);
      const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
      
      if (currentTime <= gracePeriodEnd) {
        return false;
      }
    }
    
    return true;
  }
  
  static getNeglectedTimeSlots(assignment: any, currentTime: Date = new Date()): any[] {
    if (assignment.completed) return [];
    
    const dueDate = new Date(assignment.dueDate);
    const neglectedSlots: any[] = [];
    
    if (currentTime < dueDate) return [];
    
    let timeSlotsToCheck: any[] = [];
    
    if (assignment.timeSlot) {
      timeSlotsToCheck = [assignment.timeSlot];
    } else if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0) {
      timeSlotsToCheck = assignment.task.timeSlots;
    }
    
    if (timeSlotsToCheck.length === 0) return [];
    
    const completedSlotIds: string[] = (assignment.completedTimeSlotIds as string[]) || [];
    const missedSlotIds: string[] = (assignment.missedTimeSlotIds as string[]) || [];
    
    for (const slot of timeSlotsToCheck) {
      if (completedSlotIds.includes(slot.id) || missedSlotIds.includes(slot.id)) continue;
      
      const endParts = slot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      const endTime = new Date(dueDate);
      endTime.setHours(endHour, endMinute, 0, 0);
      const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
      
      if (currentTime > gracePeriodEnd) {
        neglectedSlots.push({
          ...slot,
          neglectedAt: new Date(),
          pointsLost: slot.points || assignment.points
        });
      }
    }
    
    return neglectedSlots;
  }
  
  static hasAvailableTimeSlot(assignment: any, currentTime: Date = new Date()): boolean {
    const dueDate = new Date(assignment.dueDate);
    const currentDate = currentTime;
    
    if (dueDate.toDateString() !== currentDate.toDateString()) {
      return false;
    }
    
    let timeSlotsToCheck: any[] = [];
    
    if (assignment.timeSlot) {
      timeSlotsToCheck = [assignment.timeSlot];
    } else if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0) {
      timeSlotsToCheck = assignment.task.timeSlots;
    } else {
      return true;
    }
    
    const completedSlotIds: string[] = (assignment.completedTimeSlotIds as string[]) || [];
    const availableSlots = timeSlotsToCheck.filter((slot: any) => !completedSlotIds.includes(slot.id));
    
    if (availableSlots.length === 0) return false;
    
    for (const slot of availableSlots) {
      if (!slot) continue;
      
      const endParts = slot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      const endTime = new Date(dueDate);
      endTime.setHours(endHour, endMinute, 0, 0);
      const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
      
      if (currentDate <= gracePeriodEnd) {
        return true;
      }
    }
    
    return false;
  }
  
  static getCurrentActiveTimeSlot(assignment: any, currentTime: Date = new Date()): any | null {
    const dueDate = new Date(assignment.dueDate);
    const currentDate = currentTime;
    
    if (dueDate.toDateString() !== currentDate.toDateString()) {
      return null;
    }
    
    let timeSlotsToCheck: any[] = [];
    
    if (assignment.timeSlot) {
      timeSlotsToCheck = [assignment.timeSlot];
    } else if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0) {
      timeSlotsToCheck = assignment.task.timeSlots;
    } else {
      return null;
    }
    
    const completedSlotIds: string[] = (assignment.completedTimeSlotIds as string[]) || [];
    const availableSlots = timeSlotsToCheck.filter((slot: any) => !completedSlotIds.includes(slot.id));
    
    for (const slot of availableSlots) {
      if (!slot) continue;
      
      const endParts = slot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      const endTime = new Date(dueDate);
      endTime.setHours(endHour, endMinute, 0, 0);
      
      const submissionStart = new Date(endTime.getTime() - 30 * 60000);
      const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
      
      if (currentDate >= submissionStart && currentDate <= gracePeriodEnd) {
        return slot;
      }
    }
    
    return null;
  }
  
  static getNextTimeSlot(assignment: any, currentTime: Date = new Date()): any | null {
    const dueDate = new Date(assignment.dueDate);
    const currentDate = currentTime;
    
    if (dueDate.toDateString() !== currentDate.toDateString()) {
      return null;
    }
    
    let timeSlotsToCheck: any[] = [];
    
    if (assignment.timeSlot) {
      timeSlotsToCheck = [assignment.timeSlot];
    } else if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0) {
      timeSlotsToCheck = assignment.task.timeSlots;
    } else {
      return null;
    }
    
    const completedSlotIds: string[] = (assignment.completedTimeSlotIds as string[]) || [];
    const availableSlots = timeSlotsToCheck.filter((slot: any) => !completedSlotIds.includes(slot.id));
    
    if (availableSlots.length === 0) return null;
    
    const sortedSlots = [...availableSlots].sort((a: any, b: any) => {
      const aStartParts = a.startTime.split(':');
      const bStartParts = b.startTime.split(':');
      
      const aStart = parseInt(aStartParts[0] || '0', 10) * 60 + 
                    parseInt(aStartParts[1] || '0', 10);
      const bStart = parseInt(bStartParts[0] || '0', 10) * 60 + 
                    parseInt(bStartParts[1] || '0', 10);
      return aStart - bStart;
    });
    
    const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
    
    for (const slot of sortedSlots) {
      const startParts = slot.startTime.split(':');
      const startHour = parseInt(startParts[0] || '0', 10);
      const startMinute = parseInt(startParts[1] || '0', 10);
      const startInMinutes = startHour * 60 + startMinute;
      
      if (startInMinutes > currentMinutes) {
        return slot;
      }
    }
    
    return null;
  }
  
  static calculateLatePenalty(assignment: any, currentTime: Date = new Date()): {
    isLate: boolean;
    penaltyAmount: number;
    finalPoints: number;
    activeSlot: any | null;
  } {
    const result = this.canSubmitAssignment(assignment, currentTime);
    
    if (!result.allowed) {
      return {
        isLate: true,
        penaltyAmount: assignment.points,
        finalPoints: 0,
        activeSlot: null
      };
    }
    
    if (result.willBePenalized) {
      const originalPoints = result.originalPoints || assignment.points;
      const penaltyAmount = Math.floor(originalPoints * this.LATE_SUBMISSION_PENALTY);
      return {
        isLate: true,
        penaltyAmount,
        finalPoints: originalPoints - penaltyAmount,
        activeSlot: result.activeSlot || null
      };
    }
    
    return {
      isLate: false,
      penaltyAmount: 0,
      finalPoints: result.originalPoints || assignment.points,
      activeSlot: result.activeSlot || null
    };
  }
  
  static getCurrentSlotPoints(assignment: any, currentTime: Date = new Date()): number {
    const activeSlot = this.getCurrentActiveTimeSlot(assignment, currentTime);
    
    if (activeSlot) {
      return activeSlot.points || assignment.points;
    }
    
    return assignment.points;
  }
  
  static getAllSlotsSubmissionInfo(assignment: any): {
    slotId: string;
    startTime: string;
    endTime: string;
    label: string | null;
    points: number;
    status: 'pending' | 'completed' | 'missed' | 'available' | 'expired';
    submissionStart: Date;
    gracePeriodEnd: Date;
    timeLeft: number | null;
    timeLeftText: string | null;
  }[] {
    const dueDate = new Date(assignment.dueDate);
    const currentTime = new Date();
    
    let timeSlotsToCheck: any[] = [];
    
    if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0) {
      timeSlotsToCheck = assignment.task.timeSlots;
    } else if (assignment.timeSlot) {
      timeSlotsToCheck = [assignment.timeSlot];
    } else {
      return [];
    }
    
    const completedSlotIds: string[] = (assignment.completedTimeSlotIds as string[]) || [];
    const missedSlotIds: string[] = (assignment.missedTimeSlotIds as string[]) || [];
    
    return timeSlotsToCheck.map((slot: any) => {
      const endParts = slot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      const endTime = new Date(dueDate);
      endTime.setHours(endHour, endMinute, 0, 0);
      
      const submissionStart = new Date(endTime.getTime() - 30 * 60000);
      const gracePeriodEnd = new Date(endTime.getTime() + this.GRACE_PERIOD_MINUTES * 60000);
      
      let status: 'pending' | 'completed' | 'missed' | 'available' | 'expired' = 'pending';
      
      if (completedSlotIds.includes(slot.id)) {
        status = 'completed';
      } else if (missedSlotIds.includes(slot.id)) {
        status = 'missed';
      } else if (currentTime >= submissionStart && currentTime <= gracePeriodEnd) {
        status = 'available';
      } else if (currentTime > gracePeriodEnd) {
        status = 'expired';
      }
      
      let timeLeft: number | null = null;
      let timeLeftText: string | null = null;
      
      if (status === 'available') {
        timeLeft = Math.max(0, Math.floor((gracePeriodEnd.getTime() - currentTime.getTime()) / 1000));
        timeLeftText = this.getTimeLeftText(timeLeft);
      } else if (status === 'pending' && currentTime < submissionStart) {
        timeLeft = Math.floor((submissionStart.getTime() - currentTime.getTime()) / 1000);
        timeLeftText = this.getTimeLeftText(timeLeft);
      }
      
      return {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label || null,
        points: slot.points || assignment.points,
        status,
        submissionStart,
        gracePeriodEnd,
        timeLeft,
        timeLeftText
      };
    });
  }
  
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
      
      if (currentInMinutes >= startInMinutes && 
          currentInMinutes <= (endInMinutes + 30)) {
        return slot;
      }
    }
    
    return null;
  }
  
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
  
  static getTimeUntil(targetDate: Date, currentTime: Date = new Date()): number | null {
    const diff = targetDate.getTime() - currentTime.getTime();
    if (diff <= 0) return null;
    return Math.ceil(diff / 1000);
  }
  
  static formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  static getWeekBoundaries(weekOffset: number = 0): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday + (weekOffset * 7));
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    return { weekStart, weekEnd };
  }
  
  static getDayOfWeekFromIndex(index: number): DayOfWeek {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
    const safeIndex = ((index % 7) + 7) % 7;
    return days[safeIndex] as DayOfWeek;
  }
  
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
  
  static validateTimeSlot(startTime: string, endTime: string): boolean {
    const startParts = startTime.split(':');
    const startHourStr = startParts[0] || '0';
    const startMinuteStr = startParts[1] || '0';
    
    const startHour = parseInt(startHourStr, 10);
    const startMinute = parseInt(startMinuteStr, 10);
    
    const endParts = endTime.split(':');
    const endHourStr = endParts[0] || '0';
    const endMinuteStr = endParts[1] || '0';
    
    const endHour = parseInt(endHourStr, 10);
    const endMinute = parseInt(endMinuteStr, 10);
    
    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
      return false;
    }
    
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      return false;
    }
    
    if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
      return false;
    }
    
    const startInMinutes = startHour * 60 + startMinute;
    const endInMinutes = endHour * 60 + endMinute;
    
    return endInMinutes > startInMinutes;
  }
  
  static convertTo24Hour(hour: string, minute: string, period: string): string {
    let hourNum = parseInt(hour, 10);
    
    if (period === 'PM' && hourNum !== 12) {
      hourNum += 12;
    } else if (period === 'AM' && hourNum === 12) {
      hourNum = 0;
    }
    
    return `${hourNum.toString().padStart(2, '0')}:${minute}`;
  }
  
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