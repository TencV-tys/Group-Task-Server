// helpers/assignment.helpers.ts - NEW FILE
export class AssignmentHelpers {
  
  static validatePhotoUrl(url: string | null): boolean {
    if (!url) return true; // Photo is optional
    
    try {
      new URL(url);
      return url.startsWith('http') || url.startsWith('https');
    } catch {
      return false;
    }
  }

  static formatNotes(notes?: string): string | undefined {
    if (!notes) return undefined;
    
    const trimmed = notes.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  static calculateCompletionTime(dueDate: Date, completedAt: Date): string {
    const diffMs = completedAt.getTime() - dueDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 0) {
      return `Completed ${Math.abs(diffHours)} hours early`;
    } else if (diffHours === 0) {
      return "Completed on time";
    } else {
      return `Completed ${diffHours} hours late`;
    }
  }

  static getVerificationStatus(assignment: any): {
    status: 'pending' | 'verified' | 'rejected';
    message: string;
    icon: string;
    color: string;
  } {
    if (!assignment.completed) {
      return { 
        status: 'pending', 
        message: 'Not completed yet',
        icon: 'clock-outline',
        color: '#e67700'
      };
    }
    
    if (assignment.verified === true) {
      return { 
        status: 'verified', 
        message: 'Verified by admin',
        icon: 'check-circle',
        color: '#2b8a3e'
      };
    } else if (assignment.verified === false) {
      return { 
        status: 'rejected', 
        message: 'Rejected by admin',
        icon: 'close-circle',
        color: '#fa5252'
      };
    }
    
    return { 
      status: 'pending', 
      message: 'Awaiting verification',
      icon: 'clock-alert',
      color: '#e67700'
    };
  }

  static calculatePointsEarned(assignment: any): number {
    if (!assignment.completed || assignment.verified !== true) {
      return 0;
    }
    return assignment.points || 0;
  }

  static getTimeUntilDue(dueDate: Date): {
    isOverdue: boolean;
    message: string;
  } {
    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) {
      return {
        isOverdue: true,
        message: 'Overdue'
      }; 
    } else if (diffDays > 0) {
      return {
        isOverdue: false,
        message: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`
      };
    } else if (diffHours > 0) {
      return {
        isOverdue: false,
        message: `Due in ${diffHours} hour${diffHours > 1 ? 's' : ''}`
      };
    } else {
      return {
        isOverdue: false,
        message: 'Due today'
      };
    }
  }
}