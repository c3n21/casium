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
        // RD-219 U3b: legacy `.card h2, .card h3 { margin: 0 0 8px; letter-spacing: -.025em; }`
        // (globals.css:133) targeted any h2/h3 descendant of `.card`. Reproduced here once,
        // centrally, as descendant arbitrary variants so no call site needs its own override.
        // tracking-tight is Tailwind's default -0.025em, an exact match; mb-2 is 8px.
        // RD-219 U3b: dropped `text-sm` from the root. `.card` (globals.css) never set a
        // font-size, so its content inherited the body's browser-default 16px; `text-sm`
        // silently shrank every Card descendant to 14px instead. Visible proof: the demo-flow
        // step-card copy on `/` wraps to two lines at after-221's 16px but fits on one line
        // at 14px, and nearly every call site (MandateStatus, ApplicationInbox,
        // provider/page.tsx) already layers its own explicit text-[0.85rem]/text-[0.9rem]/
        // text-sm downscaling on specific lines — which only makes sense against a 16px
        // ambient, not an already-14px one. text-card-foreground (color) is unaffected.
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-[var(--radius)] border border-solid border-line bg-card px-(--card-spacing) py-(--card-spacing) text-card-foreground shadow-[var(--shadow)] [--card-spacing:20px] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-[var(--radius)] *:[img:last-child]:rounded-b-[var(--radius)] [&_h2]:m-0 [&_h2]:mb-2 [&_h2]:tracking-tight [&_h3]:m-0 [&_h3]:mb-2 [&_h3]:tracking-tight",
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
