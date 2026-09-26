interface StatusStepperProps {
  steps: string[];
  current: string;
}

function labelFor(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/** Horizontal status stepper (07_STATUS_WORKFLOWS.md) shared by receipts/deliveries. */
export function StatusStepper({ steps, current }: StatusStepperProps) {
  const currentIndex = steps.findIndex((step) => step.toLowerCase() === current.toLowerCase());

  // Canceled is a terminal side-state that is not part of the happy-path steps; append it
  // so the current status is always visible (BR25 allows cancellation from open states).
  const renderedSteps = currentIndex === -1 ? [...steps, labelFor(current)] : steps;
  const activeIndex = currentIndex === -1 ? renderedSteps.length - 1 : currentIndex;
  const canceled = current.toUpperCase() === 'CANCELED';

  return (
    <ol className="stepper" aria-label="Status progression">
      {renderedSteps.map((step, index) => {
        const className =
          index < activeIndex
            ? 'stepper-step stepper-done'
            : index === activeIndex
              ? `stepper-step ${canceled && index === renderedSteps.length - 1 ? 'stepper-canceled' : 'stepper-current'}`
              : 'stepper-step';
        return (
          <li key={step} className={className} aria-current={index === activeIndex ? 'step' : undefined}>
            <span className="stepper-dot" aria-hidden="true" />
            {step}
          </li>
        );
      })}
    </ol>
  );
}
