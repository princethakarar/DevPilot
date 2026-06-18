import { Loader2 } from "lucide-react";
import React from "react";

interface LoadingStepProps {
  currentStep: number;
  step: number;
  label: string;
}

const LoadingStep: React.FC<LoadingStepProps> = ({
  currentStep,
  step,
  label,
}) => {
  const isActive = currentStep === step;
  const isDone = currentStep > step;

  return (
    <div className="flex items-center gap-3 py-1 font-sans text-xs">
      <div className="flex items-center justify-center w-5 h-5 shrink-0">
        {isDone ? (
          <svg
            className="h-4 w-4 text-[#34D399]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : isActive ? (
          <Loader2 className="h-3.5 w-3.5 text-[#38BDF8] animate-spin" />
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-[#3D5470]" />
        )}
      </div>
      <span
        className={
          isDone
            ? "text-[#6B8CAE]"
            : isActive
            ? "text-[#E2EAF4] font-medium"
            : "text-[#3D5470]"
        }
      >
        {label}
      </span>
    </div>
  );
};

export default LoadingStep;