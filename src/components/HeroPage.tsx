import { Zap, BarChart3, GitCompareArrows, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onConfigure: () => void;
}

const features = [
  {
    icon: Zap,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    title: "Electricity & Gas",
    desc: "Area charts of your daily consumption across flexible date ranges.",
  },
  {
    icon: BarChart3,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "Live Tariff Rates",
    desc: "Unit rate and standing charge pulled straight from the Octopus API.",
  },
  {
    icon: GitCompareArrows,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    title: "What-If Comparison",
    desc: "See what you'd pay on Flexible, Agile, Cosy, Go and Fixed tariffs.",
  },
  {
    icon: ShieldCheck,
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    title: "Private by default",
    desc: "Credentials stored in your browser's localStorage.",
  },
];

const steps = [
  {
    n: "01",
    text: (
      <>
        Go to{" "}
        <a
          href="https://octopus.energy/dashboard/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
        >
          octopus.energy/dashboard
        </a>{" "}
        and sign in. Your <strong>account number</strong> (A-XXXXXXXX) is shown on this page.
      </>
    ),
  },
  {
    n: "02",
    text: (
      <>
        Click your profile (top-right) → <strong>Personal details</strong>.{" "}
        <a
          href="https://octopus.energy/dashboard/new/accounts/personal-details/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 text-pink-400 hover:text-pink-300 break-all"
        >
          octopus.energy/dashboard/new/accounts/personal-details/
        </a>
      </>
    ),
  },
  {
    n: "03",
    text: (
      <>
        Scroll to the <strong>Developer settings</strong> card → click{" "}
        <strong>API access</strong> → <strong>Regenerate my API key</strong>.
        Copy the key.
      </>
    ),
  },
  {
    n: "04",
    text: (
      <>
        On the{" "}
        <a
          href="https://octopus.energy/dashboard/new/accounts/personal-details/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
        >
          Personal details
        </a>{" "}
        page, scroll down to find your <strong>Electricity</strong> and <strong>Gas</strong> meter sections — copy the MPAN, MPRN and serial numbers from there.
      </>
    ),
  },
];

export function HeroPage({ onConfigure }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      {/* Hero */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2.5 mb-6 rounded-full border border-pink-500/30 bg-pink-500/10 px-4 py-1.5 text-sm text-pink-400">
          <Zap className="h-3.5 w-3.5" />
          Octopus Energy · Personal Dashboard
        </div>
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
          Your energy,{" "}
          <span className="text-pink-400">clearly.</span>
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
          A private, browser-side dashboard that reads your Octopus Energy
          consumption and shows what different tariffs would cost you.
        </p>
        <Button
          onClick={onConfigure}
          size="lg"
          className="bg-pink-500 hover:bg-pink-400 text-black font-semibold px-8"
        >
          Configure your account
        </Button>
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 gap-3 mb-14">
        {features.map(({ icon: Icon, color, bg, title, desc }) => (
          <div
            key={title}
            className="rounded-xl border border-border/50 bg-card/50 p-4 flex gap-3"
          >
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div>
              <p className="text-sm font-medium mb-0.5">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* How to get your credentials */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6">
        <p className="text-sm font-semibold mb-5 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-pink-400" />
          How to find your credentials
        </p>
        <ol className="space-y-5">
          {steps.map(({ n, text }) => (
            <li key={n} className="flex gap-4">
              <span className="shrink-0 font-mono text-xs text-pink-500 bg-pink-500/10 rounded-md h-6 w-8 flex items-center justify-center mt-0.5">
                {n}
              </span>
              <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 pt-5 border-t border-border/50 flex justify-end">
          <Button
            onClick={onConfigure}
            className="bg-pink-500 hover:bg-pink-400 text-black font-semibold"
          >
            I'm ready — let's go
          </Button>
        </div>
      </div>
    </div>
  );
}
