import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-mono text-[11px] uppercase tracking-[0.16em] transition disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'border-amber-dim bg-amber/5 text-amber-bright hover:border-amber hover:bg-amber hover:text-black',
        primary: 'border-amber bg-amber text-black hover:bg-amber-bright',
        danger: 'border-bad/60 text-bad hover:bg-bad hover:text-black',
        ghost: 'border-transparent text-amber-bright hover:border-amber-dim',
      },
      size: { default: 'h-9 px-4', sm: 'h-7 px-3', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
