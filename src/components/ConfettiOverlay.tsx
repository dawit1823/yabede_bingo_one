import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

export interface ConfettiOverlayProps {
  /**
   * Whether confetti animation should be actively firing.
   * Typically passed as Boolean(winNotification).
   */
  trigger: boolean;
  /**
   * Total animation duration in milliseconds. Defaults to 4000ms.
   */
  duration?: number;
  /**
   * Optional callback triggered when the animation cycle completes.
   */
  onComplete?: () => void;
  /**
   * Custom color palette for the confetti particles.
   */
  colors?: string[];
}

const DEFAULT_CONFETTI_COLORS = [
  '#fbbf24', // Amber/Gold
  '#f59e0b', // Warm Gold
  '#10b981', // Emerald
  '#34d399', // Mint
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#3b82f6', // Sky Blue
  '#ffffff', // White Sparkle
];

export const ConfettiOverlay: React.FC<ConfettiOverlayProps> = ({
  trigger,
  duration = 4000,
  onComplete,
  colors = DEFAULT_CONFETTI_COLORS,
}) => {
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!trigger) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      confetti.reset();
      return;
    }

    // 1. Initial high-impact central explosion
    try {
      confetti({
        particleCount: 100,
        spread: 90,
        origin: { y: 0.55 },
        colors,
        disableForReducedMotion: true,
      });

      // 2. Continuous multi-angle cannon blast over the duration
      const endTimestamp = Date.now() + duration;

      const frameLoop = () => {
        const timeLeft = endTimestamp - Date.now();

        if (timeLeft <= 0) {
          if (onComplete) onComplete();
          return;
        }

        const particleCount = Math.floor(40 * (timeLeft / duration)) + 15;

        // Left cannon shooting up-right
        confetti({
          particleCount: Math.min(particleCount, 30),
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors,
          disableForReducedMotion: true,
        });

        // Right cannon shooting up-left
        confetti({
          particleCount: Math.min(particleCount, 30),
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors,
          disableForReducedMotion: true,
        });

        // Center golden stars shimmer
        if (Math.random() < 0.3) {
          confetti({
            particleCount: 15,
            spread: 360,
            ticks: 60,
            gravity: 0.5,
            decay: 0.94,
            startVelocity: 30,
            shapes: ['star'],
            colors: ['#fbbf24', '#f59e0b', '#ffffff', '#fde047'],
            origin: {
              x: 0.3 + Math.random() * 0.4,
              y: 0.3 + Math.random() * 0.3,
            },
            disableForReducedMotion: true,
          });
        }

        animationFrameRef.current = requestAnimationFrame(frameLoop);
      };

      // Slight delay for second burst to create satisfying rhythm
      timerRef.current = setTimeout(() => {
        animationFrameRef.current = requestAnimationFrame(frameLoop);
      }, 250);
    } catch (err) {
      console.error('[ConfettiOverlay] Error triggering confetti animation:', err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      confetti.reset();
    };
  }, [trigger, duration, onComplete, colors]);

  // Component does not need to render visible DOM elements since canvas-confetti creates its own canvas
  return null;
};

export default ConfettiOverlay;
