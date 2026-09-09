import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { saveConfig, clearConfig } from "@/lib/config";
import type { OctopusConfig } from "@/types";

const steps = ["Account", "API Key", "Electricity", "Gas"] as const;

const stepSchemas = [
  z.object({ accountNumber: z.string().regex(/^A-[A-Z0-9]+$/, "Format: A-XXXXXXXX") }),
  z.object({ apiKey: z.string().min(20, "Looks too short") }),
  z.object({
    elMpan: z.string().length(13, "MPAN must be 13 digits"),
    elSn: z.string().min(1, "Required"),
  }),
  z.object({
    gasMprn: z.string().min(6, "MPRN too short"),
    gasSn: z.string().min(1, "Required"),
  }),
];

interface Props {
  open: boolean;
  onComplete: (cfg: OctopusConfig) => void;
  onClose?: () => void;
  initialValues?: OctopusConfig | null;
}

export function SetupWizard({ open, onComplete, onClose, initialValues }: Props) {
  const [step, setStep] = useState(0);
  const [partial, setPartial] = useState<Partial<OctopusConfig>>(
    initialValues ?? {}
  );

  const form = useForm({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(stepSchemas[step]) as any,
    defaultValues: partial,
  });

  function onNext(values: Partial<OctopusConfig>) {
    const merged = { ...partial, ...values };
    setPartial(merged);
    if (step < steps.length - 1) {
      setStep(step + 1);
      form.reset({ ...merged });
    } else {
      saveConfig(merged as OctopusConfig);
      onComplete(merged as OctopusConfig);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        className="sm:max-w-md border-border/50 bg-card"
      >
        <DialogHeader>
          {/* Branding header */}
          <div className="flex items-center gap-3 pb-4 border-b border-border/50 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/20 shrink-0">
              <svg
                className="h-5 w-5 text-pink-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Octopus Dashboard</p>
              <p className="text-xs text-muted-foreground mt-0.5">Connect your energy account</p>
            </div>
          </div>
          <DialogTitle className="text-sm font-medium tracking-tight text-muted-foreground">
            Step {step + 1} of {steps.length} — {steps[step]}
          </DialogTitle>
          <div className="flex gap-1.5 pt-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  i <= step ? "bg-pink-500" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onNext)} className="space-y-4 pt-2">
            {step === 0 && (
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="A-XXXXXXXX"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Found on your{" "}
                      <a
                        href="https://octopus.energy/dashboard/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
                      >
                        Octopus dashboard
                      </a>{" "}
                      home page. Starts with <code className="font-mono text-foreground">A-</code>.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {step === 1 && (
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="sk_live_…"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                      <p>
                        Go to{" "}
                        <a
                          href="https://octopus.energy/dashboard/new/accounts/personal-details/api-access"
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
                        >
                          Personal details
                        </a>{" "}
                        → scroll to the <strong className="text-foreground">Developer settings</strong> card.
                      </p>
                      <p>
                        Click{" "}
                        <a
                          href="https://octopus.energy/dashboard/new/accounts/personal-details/api-access"
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
                        >
                          API access
                        </a>{" "}
                        → <strong className="text-foreground">Regenerate my API key</strong> and copy the key shown.
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {step === 2 && (
              <>
                <FormField
                  control={form.control}
                  name="elMpan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Electricity MPAN <span className="text-muted-foreground font-normal">(13 digits)</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="1234567890123"
                          maxLength={13}
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="elSn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meter serial number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="E1B12345"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Both values are on the same{" "}
                  <a
                    href="https://octopus.energy/dashboard/new/accounts/personal-details/api-access"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
                  >
                    API access
                  </a>{" "}
                  page from step 2 — scroll down to the <strong className="text-foreground">Examples</strong> section, under the <strong className="text-foreground">Electricity</strong> meter section.
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <FormField
                  control={form.control}
                  name="gasMprn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gas MPRN</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="1234567890"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gasSn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meter serial number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="G4P12345"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Both values are on the same{" "}
                  <a
                    href="https://octopus.energy/dashboard/new/accounts/personal-details/api-access"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 text-pink-400 hover:text-pink-300"
                  >
                    API access
                  </a>{" "}
                  page from step 2 — scroll down to the <strong className="text-foreground">Examples</strong> section, under the <strong className="text-foreground">Gas</strong> meter section.
                </p>
              </>
            )}

            <div className="flex justify-between pt-2">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              ) : (
                <div />
              )}
              <Button type="submit" className="bg-pink-600 hover:bg-pink-500 text-white">
                {step < steps.length - 1 ? "Next" : "Save & continue"}
              </Button>
            </div>
          </form>
        </Form>

        {/* Clear saved data */}
        <Separator className="opacity-50" />
        {initialValues && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
            onClick={() => { clearConfig(); onClose?.(); }}
          >
            Clear account details
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}