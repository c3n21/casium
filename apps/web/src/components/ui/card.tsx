import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        // RD-219 U2b: geometry matched to the legacy `.card` rule (globals.css) so call
        // sites don't need to override it (see MandateStatus.tsx). Border switched from
        // ring-1 ring-foreground/10 to a real 1px border-line to match `.card` exactly and
        // to stay consistent with the U1 Alert/Badge primitives, which already use
        // `border border-solid border-line`. border-solid is explicit because Preflight is
        // not imported in this repo, so the browser default border-style (none) would
        // otherwise hide the border. Root now also carries px-(--card-spacing) (legacy
        // `.card` has no header/content/footer split, just one padded box) so a bare
        // <Card> with flat children — every real call site today — gets 20px on all four
        // sides without a per-call-site override. Known trade-off: if a future caller
        // composes <Card> with CardHeader/CardContent/CardFooter, those still add their
        // own px-(--card-spacing) on top of the root's, doubling the inset. No caller does
        // that today (grep confirms Card is only ever used with plain children), so it's
        // left as a follow-up rather than solved speculatively here.
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-[var(--radius)] border border-solid border-line bg-card px-(--card-spacing) py-(--card-spacing) text-sm text-card-foreground shadow-[var(--shadow)] [--card-spacing:20px] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-[var(--radius)] *:[img:last-child]:rounded-b-[var(--radius)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-normal font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
