'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tv, MessageCircle, Megaphone, Calendar, Users, Wrench,
  Palette, ChevronLeft, ChevronRight, Sparkles, Rocket, X
} from 'lucide-react';

interface OnboardingTourProps {
  onComplete: () => void;
}

const steps = [
  {
    icon: Sparkles,
    title: 'ברוכים הבאים! 🎬',
    description: 'TV Industry IL - הפלטפורמה המקצועית לתעשיית הטלוויזיה הישראלית. כאן תמצאו את כל מה שאתם צריכים!',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Calendar,
    title: 'לוח שידורים 📺',
    description: 'צפו בלוח השידורים המלא של כל הערוצים. עדכונים בזמן אמת עם תוכן שידורים שוטף.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Users,
    title: 'אלפון מקצועי 👥',
    description: 'גלו אנשי מקצוע מהתעשייה. חפשו לפי תפקיד, ערוץ או מחלקה וצרו קשר במהירות.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: MessageCircle,
    title: 'צ\'אט מקצועי 💬',
    description: 'צ\'אט כמו WhatsApp! חדרים כלליים, קבוצות לפי הפקה, שיחות פרטיות, שיתוף קבצים ושיחות וידאו.',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    icon: Megaphone,
    title: 'לוח מודעות 📢',
    description: 'הצעות עבודה, חיפוש עבודה, ציוד למכירה ולמסירה. הכל בלוח אחד מרכזי.',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: Wrench,
    title: 'כלים מקצועיים 🛠️',
    description: 'טיימר הפקה, מחשבון עלויות, ספירה לאחור לשידור, צ\'קליסט ציוד ועוד כלים שימושיים.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Palette,
    title: 'התאמה אישית 🎨',
    description: 'בחרו ערכת נושא שמתאימה לכם: כהה, בהיר, חצות, שקיעה או יער. הכל מתעדכן בלחיצה!',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: Rocket,
    title: 'מוכנים לצאת לדרך! 🚀',
    description: 'זהו! עכשיו אתם מכירים את כל הפיצ\'רים. התחילו לחקור את הפלטפורמה וליהנות!',
    color: 'from-purple-500 to-blue-500',
  },
];

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const step = steps[currentStep];
  const StepIcon = step.icon;
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  };

  const goPrev = () => {
    if (!isFirst) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--theme-bg-secondary)', borderColor: 'var(--theme-border)' }}
      >
        {/* Skip button */}
        <div className="flex justify-end p-3">
          <button
            onClick={onComplete}
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-accent-glow)] transition-all"
          >
            דלג
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            initial={{ opacity: 0, x: direction > 0 ? 100 : -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -100 : 100 }}
            transition={{ duration: 0.3 }}
            className="px-8 pb-6 text-center"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className={`w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center bg-gradient-to-br ${step.color} shadow-lg`}
            >
              <StepIcon className="w-10 h-10 text-white" />
            </motion.div>

            {/* Title */}
            <h2 className="text-xl font-black text-[var(--theme-text)] mb-2">{step.title}</h2>

            {/* Description */}
            <p className="text-sm text-[var(--theme-text-secondary)] leading-relaxed">{step.description}</p>
          </motion.div>
        </AnimatePresence>

        {/* Progress & Navigation */}
        <div className="px-6 pb-6">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep ? 'w-6 bg-[var(--theme-accent)]' : 'w-1.5 bg-[var(--theme-border)]'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {!isFirst && (
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-[var(--theme-border)] text-sm text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-glow)] transition-all"
              >
                <ChevronRight className="w-4 h-4" />
                הקודם
              </button>
            )}
            <button
              onClick={goNext}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-l from-purple-500 to-blue-600 text-white font-bold hover:shadow-lg transition-all"
            >
              {isLast ? (
                <>
                  <Rocket className="w-4 h-4" />
                  בואו נתחיל!
                </>
              ) : (
                <>
                  הבא
                  <ChevronLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
