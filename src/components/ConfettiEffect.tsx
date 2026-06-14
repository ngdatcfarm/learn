import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Particle {
  id: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
  size: number;
  shape: 'star' | 'circle' | 'square';
}

interface ConfettiEffectProps {
  active: boolean;
  onComplete: () => void;
}

const COLORS = [
  '#FFC107', // Gold yellow
  '#FF5722', // Orange red
  '#4CAF50', // Emerald green
  '#2196F3', // sky blue
  '#E91E63', // pink
  '#9C27B0', // Purple
  '#00BCD4', // Cyan
];

export default function ConfettiEffect({ active, onComplete }: ConfettiEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (active) {
      // Spawn bursts of colorful fun particles!
      const newParticles: Particle[] = Array.from({ length: 45 }).map((_, i) => {
        const angle = Math.random() * Math.PI * 2; // Full circle
        const distance = 40 + Math.random() * 120; // Flight distance
        const shapes: ('star' | 'circle' | 'square')[] = ['star', 'circle', 'square'];

        return {
          id: Date.now() + i,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 20, // slightly bias upwards
          rotate: Math.random() * 360,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: 8 + Math.random() * 16,
          shape: shapes[Math.floor(Math.random() * shapes.length)],
        };
      });

      setParticles(newParticles);

      // Clean up after 1.5 seconds
      const timer = setTimeout(() => {
        setParticles([]);
        onComplete();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center overflow-visible">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              scale: [0, 1.2, 1, 0.4],
              x: p.x,
              y: p.y + 40, // simulate soft cartoon gravity falling
              opacity: [1, 1, 0.7, 0],
              rotate: p.rotate + (Math.random() > 0.5 ? 180 : -180),
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.2,
              ease: 'easeOut',
            }}
            className="absolute"
            style={{
              width: p.size,
              height: p.size,
            }}
          >
            {p.shape === 'star' && (
              <svg viewBox="0 0 24 24" fill={p.color} width="100%" height="100%">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            )}
            {p.shape === 'circle' && (
              <div
                className="rounded-full w-full h-full shadow-sm"
                style={{ backgroundColor: p.color }}
              />
            )}
            {p.shape === 'square' && (
              <div
                className="rounded-sm w-full h-full shadow-sm"
                style={{
                  backgroundColor: p.color,
                  transform: 'rotate(45deg)',
                }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
