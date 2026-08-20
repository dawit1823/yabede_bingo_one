// Safe mock/no-op functions for standalone Admin Panel web dashboard
export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate?.(style === 'heavy' ? 40 : 15);
    } catch {
      // Ignore vibration errors
    }
  }
};

export const triggerNotificationHaptic = (type: 'error' | 'success' | 'warning') => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate?.(type === 'error' ? [50, 50, 50] : 30);
    } catch {
      // Ignore vibration errors
    }
  }
};
