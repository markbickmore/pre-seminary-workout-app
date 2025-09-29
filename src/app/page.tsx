"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pause,
  Square,
  Plus,
  Save,
  Timer as TimerIcon,
  Settings,
  User,
  Users,
  Edit3,
  Trash2,
  BookOpen,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

/**
 * PRE-SEMINARY WORKOUT — SINGLE-FILE PAGE
 * - Student & Instructor dashboards
 * - 45-minute timer with blocks
 * - Per-block metric logging (reps/time/distance/custom)
 * - % improvement from first log
 * - LocalStorage persistence (swap for backend later)
 */

/* =========================
   Types
   ========================= */

type Block = {
  id: string;
  name: string;
  minutes: number;
  intensity: "low" | "moderate" | "high";
  metric?: {
    kind: "reps" | "time_s" | "distance_m" | "custom";
    label?: string;
    higherIsBetter?: boolean;
  };
  target?: number;
  notes?: string;
};

export type WorkoutPlan = {
  id: string;
  title: string;
  tags: string[];
  blocks: Block[];
  author: string;
};

type SessionLog = {
  id: string;
  userId?: string;
  planId: string;
  date: string; // ISO
  duration: number; // minutes done
  rpe: number; // 1-10
  notes?: string;
  metrics: { blockId: string; value: number }[];
};

/* =========================
   Helpers & Storage
   ========================= */

const uid = () => Math.random().toString(36).slice(2, 10);

const PLANS_KEY = "presem_plans_v1";
const LOGS_KEY = "presem_logs_v1";
const NAME_KEY = "presem_name_v1";

function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState] as const;
}

const DEFAULT_BLOCKS: Block[] = [
  {
    id: uid(),
    name: "Warmup",
    minutes: 10,
    intensity: "low",
    notes: "Mobility + breath",
    metric: { kind: "time_s", label: "Mobility", higherIsBetter: true },
  },
  {
    id: uid(),
    name: "Main Set",
    minutes: 30,
    intensity: "moderate",
    notes: "Circuit training",
    metric: { kind: "reps", label: "Total Reps", higherIsBetter: true },
    target: 150,
  },
  {
    id: uid(),
    name: "Cooldown",
    minutes: 5,
    intensity: "low",
    notes: "Stretch + reflect",
    metric: { kind: "time_s", label: "Stretch", higherIsBetter: true },
  },
];

const DEFAULT_PLANS: WorkoutPlan[] = [
  {
    id: uid(),
    title: "Baseline 45",
    tags: ["general", "intro"],
    blocks: DEFAULT_BLOCKS,
    author: "Instructor Team",
  },
  {
    id: uid(),
    title: "Strength & Stillness",
    tags: ["strength", "breath"],
    blocks: [
      {
        id: uid(),
        name: "Warmup",
        minutes: 8,
        intensity: "low",
        notes: "Joint circles + easy jog",
        metric: { kind: "time_s", label: "Warm", higherIsBetter: true },
      },
      {
        id: uid(),
        name: "Strength Circuit",
        minutes: 27,
        intensity: "high",
        notes: "Push/Pull/Squat rotations",
        metric: { kind: "reps", label: "Total Reps", higherIsBetter: true },
      },
      {
        id: uid(),
        name: "Breath & Prayer Walk",
        minutes: 10,
        intensity: "low",
        notes: "Box breathing + walk",
        metric: { kind: "time_s", label: "Walk", higherIsBetter: true },
      },
    ],
    author: "Instructor Team",
  },
];

/* =========================
   Timer Hook
   ========================= */

function useIntervalTimer(blocks: Block[]) {
  const totalMinutes = useMemo(
    () => blocks.reduce((a, b) => a + (b.minutes || 0), 0),
    [blocks]
  );
  const totalSec = totalMinutes * 60;

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const raf = useRef<number | null>(null);
  const lastTick = useRef<number | null>(null);

  const start = () => {
    if (!isRunning) setIsRunning(true);
  };
  const pause = () => setIsRunning(false);
  const reset = () => {
    setIsRunning(false);
    setElapsedSec(0);
  };

  useEffect(() => {
    if (!isRunning) {
      if (raf.current) cancelAnimationFrame(raf.current);
      lastTick.current = null;
      return;
    }
    const loop = (t: number) => {
      if (lastTick.current == null) lastTick.current = t;
      const dt = (t - lastTick.current) / 1000;
      lastTick.current = t;
      setElapsedSec((s) => Math.min(s + dt, totalSec));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [isRunning, totalSec]);

  const cumulative = useMemo(() => {
    const arr: {
      id: string;
      start: number;
      end: number;
      name: string;
      intensity: Block["intensity"];
    }[] = [];
    let acc = 0;
    for (const b of blocks) {
      const start = acc * 60;
      acc += b.minutes;
      const end = acc * 60;
      arr.push({ id: b.id, start, end, name: b.name, intensity: b.intensity });
    }
    return arr;
  }, [blocks]);

  const current = useMemo(() => {
    return (
      cumulative.find((c) => elapsedSec >= c.start && elapsedSec < c.end) ||
      cumulative[cumulative.length - 1]
    );
  }, [elapsedSec, cumulative]);

  const percent = Math.round((elapsedSec / totalSec) * 100);

  return { isRunning, start, pause, reset, elapsedSec, totalSec, percent, current };
}

/* =========================
   Small UI bits
   ========================= */

function MinutesField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-24">Minutes</Label>
      <Input
        type="number"
        min={0}
        max={60}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
      />
    </div>
  );
}

function TimerDisplay({
  elapsed,
  total,
  currentName,
}: {
  elapsed: number;
  total: number;
  currentName: string;
}) {
  const fmt = (s: number) => {
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${mm.toString().padStart(2, "0")}:${ss
      .toString()
      .padStart(2, "0")}`;
  };
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        Current Block: <span className="font-medium">{currentName}</span>
      </div>
      <div className="text-5xl font-bold tabular-nums">
        {fmt(elapsed)} / {fmt(total)}
      </div>
    </div>
  );
}

/* =========================
   Editors & Cards
   ========================= */

function BlockEditor({
  block,
  onChange,
  onDelete,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="border rounded-2xl shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Block Name</Label>
            <Input
              value={block.name}
              onChange={(e) => onChange({ ...block, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Intensity</Label>
            <Select
              value={block.intensity}
              onValueChange={(v) =>
                onChange({ ...block, intensity: v as Block["intensity"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <MinutesField
              value={block.minutes}
              onChange={(v) => onChange({ ...block, minutes: v })}
            />
          </div>
          <div className="space-y-1">
            <Label>Metric Type</Label>
            <Select
              value={block.metric?.kind || "reps"}
              onValueChange={(v) =>
                onChange({
                  ...block,
                  metric: { ...(block.metric || {}), kind: v as any },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reps">Reps (count)</SelectItem>
                <SelectItem value="time_s">Time (seconds)</SelectItem>
                <SelectItem value="distance_m">Distance (meters)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Metric Label</Label>
            <Input
              value={block.metric?.label || ""}
              onChange={(e) =>
                onChange({
                  ...block,
                  metric: {
                    ...(block.metric || { kind: "reps" }),
                    label: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Higher is better?</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={block.metric?.higherIsBetter ?? true}
                onCheckedChange={(c) =>
                  onChange({
                    ...block,
                    metric: {
                      ...(block.metric || { kind: "reps" }),
                      higherIsBetter: Boolean(c),
                    },
                  })
                }
              />
              <span className="text-sm text-muted-foreground">
                Percent improvement uses (new - old) / old
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Target (optional)</Label>
            <Input
              type="number"
              value={block.target ?? 0}
              onChange={(e) =>
                onChange({
                  ...block,
                  target: parseFloat(e.target.value || "0"),
                })
              }
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={block.notes || ""}
              onChange={(e) => onChange({ ...block, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <Badge variant="secondary">{block.minutes} min</Badge>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  onUse,
  onEdit,
  onDelete,
}: {
  plan: WorkoutPlan;
  onUse?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const total = plan.blocks.reduce((a, b) => a + b.minutes, 0);
  return (
    <Card className="border rounded-2xl shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{plan.title}</h3>
            <div className="flex gap-2 mt-1 flex-wrap">
              {plan.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">by {plan.author}</div>
        </div>
        <div className="space-y-2">
          {plan.blocks.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between text-sm border rounded-xl px-3 py-2"
            >
              <span className="font-medium">{b.name}</span>
              <div className="flex items-center gap-3">
                {b.metric?.label && (
                  <Badge variant="outline">{b.metric.label}</Badge>
                )}
                <Badge variant="secondary">{b.intensity}</Badge>
                <span>{b.minutes}m</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Badge>{total} / 45 min</Badge>
          <div className="flex gap-2">
            {onUse && <Button onClick={onUse}>Use</Button>}
            {onEdit && (
              <Button variant="outline" onClick={onEdit}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================
   Dashboards
   ========================= */

function InstructorDashboard({
  plans,
  setPlans,
}: {
  plans: WorkoutPlan[];
  setPlans: (p: WorkoutPlan[]) => void;
}) {
  const [editing, setEditing] = useState<WorkoutPlan | null>(null);

  const startNew = () => {
    setEditing({
      id: uid(),
      title: "New Plan",
      tags: [],
      blocks: DEFAULT_BLOCKS.map((b) => ({ ...b, id: uid() })),
      author: "You",
    });
  };

  const savePlan = () => {
    if (!editing) return;
    const sum = editing.blocks.reduce((a, b) => a + b.minutes, 0);
    if (sum !== 45) {
      alert(`Plan must total 45 minutes. Currently ${sum}.`);
      return;
    }
    const exists = plans.some((p) => p.id === editing.id);
    const next = exists
      ? plans.map((p) => (p.id === editing.id ? editing : p))
      : [editing, ...plans];
    setPlans(next);
    setEditing(null);
  };

  const removePlan = (id: string) => setPlans(plans.filter((p) => p.id !== id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Instructor Dashboard
        </h2>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Plan
        </Button>
      </div>

      {editing && (
        <Card className="border-2 border-dashed rounded-2xl">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Title</Label>
                <Input
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input
                  value={editing.tags.join(", ")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4">
              {editing.blocks.map((b, idx) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  onChange={(nb) =>
                    setEditing({
                      ...editing,
                      blocks: editing.blocks.map((x, i) => (i === idx ? nb : x)),
                    })
                  }
                  onDelete={() =>
                    setEditing({
                      ...editing,
                      blocks: editing.blocks.filter((_, i) => i !== idx),
                    })
                  }
                />
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setEditing({
                    ...editing,
                    blocks: [
                      ...editing.blocks,
                      {
                        id: uid(),
                        name: "New Block",
                        minutes: 0,
                        intensity: "moderate",
                        notes: "",
                      },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Block
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Total Minutes:{" "}
                <span className="font-medium">
                  {editing.blocks.reduce((a, b) => a + b.minutes, 0)}
                </span>{" "}
                (must equal 45)
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={savePlan}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Plan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            onEdit={() => setEditing(p)}
            onDelete={() => removePlan(p.id)}
          />
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Program Tips
          </h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>Keep a consistent 45-minute structure; vary intensity inside blocks.</li>
            <li>Blend physical work with breath/prayer/reflection cues in notes.</li>
            <li>Tag plans by goals (strength, endurance, mobility, contemplation).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StudentDashboard({
  plans,
  addLog,
}: {
  plans: WorkoutPlan[];
  addLog: (log: SessionLog) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(plans[0]?.id || "");
  const selected = useMemo(
    () => plans.find((p) => p.id === selectedId) || plans[0],
    [plans, selectedId]
  );

  const { isRunning, start, pause, reset, elapsedSec, totalSec, percent, current } =
    useIntervalTimer(selected?.blocks || DEFAULT_BLOCKS);

  useEffect(() => {
    reset();
  }, [selectedId]); // eslint-disable-line

  const [studentName, setStudentName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(NAME_KEY) || "";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(NAME_KEY, studentName);
    }
  }, [studentName]);

  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");
  const [metricInputs, setMetricInputs] = useState<Record<string, number>>({});

  useEffect(() => {
    const defaults: Record<string, number> = {};
    selected?.blocks.forEach((b) => {
      defaults[b.id] = 0;
    });
    setMetricInputs(defaults);
  }, [selected?.id]);

  const finish = () => {
    const minutesDone = Math.round(elapsedSec / 60);
    const metrics = Object.entries(metricInputs).map(([blockId, value]) => ({
      blockId,
      value: Number(value) || 0,
    }));
    addLog({
      id: uid(),
      userId: studentName || undefined,
      planId: selected.id,
      date: new Date().toISOString(),
      duration: minutesDone,
      rpe,
      notes,
      metrics,
    });
    reset();
  };

  // Logs & improvement %
  const logs: SessionLog[] = useMemo(() => {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
  }, [selected?.id, elapsedSec]);

  const myLogs = logs.filter((l) => l.planId === selected?.id);

  function computeImprovement(blockId: string): {
    baseline?: number;
    latest?: number;
    percent?: number;
  } {
    const series = myLogs
      .map((l) => l.metrics.find((m) => m.blockId === blockId)?.value)
      .filter((v): v is number => typeof v === "number");
    if (series.length < 2) return {};
    const baseline = series[0];
    const latest = series[series.length - 1];
    if (!baseline || baseline === 0) return { baseline, latest };
    const percent = ((latest - baseline) / baseline) * 100;
    return { baseline, latest, percent };
  }

  const chartData = useMemo(() => {
    const mine = myLogs.filter((l) => l.planId === selected?.id).slice(-10);
    return mine.map((l) => ({
      name: new Date(l.date).toLocaleDateString(),
      Minutes: l.duration,
      RPE: l.rpe,
    }));
  }, [selected?.id, elapsedSec]); // eslint-disable-line

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <User className="h-5 w-5" /> Student Dashboard
        </h2>
        <div className="w-64">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TimerIcon className="h-4 w-4" /> 45-minute guided timer
              </div>
              <TimerDisplay
                elapsed={elapsedSec}
                total={totalSec}
                currentName={current?.name || ""}
              />
            </div>
            <div className="flex items-center gap-2">
              {!isRunning ? (
                <Button onClick={start}>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              ) : (
                <Button variant="secondary" onClick={pause}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
              <Button variant="outline" onClick={reset}>
                <Square className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>

          <Progress value={percent} className="h-3 rounded-full" />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Student name card for leaderboards */}
            <div className="rounded-xl border p-3 bg-slate-50">
              <Label>Your Name</Label>
              <Input
                placeholder="e.g., Jordan A."
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used for leaderboards & invites.
              </p>
            </div>

            {selected?.blocks.map((b, i) => {
              const imp = computeImprovement(b.id);
              return (
                <div
                  key={b.id}
                  className={`rounded-xl border p-3 ${
                    current?.name === b.name ? "ring-2" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {i + 1}. {b.name}
                    </div>
                    <Badge variant="secondary">{b.intensity}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {b.minutes} minutes
                  </div>
                  {b.notes && <p className="text-sm mt-2">{b.notes}</p>}
                  {b.metric && (
                    <div className="mt-3 space-y-1">
                      <Label>Record {b.metric.label || b.metric.kind}</Label>
                      <Input
                        type="number"
                        placeholder={b.metric.kind === "time_s" ? "seconds" : "count"}
                        value={metricInputs[b.id] ?? 0}
                        onChange={(e) =>
                          setMetricInputs({
                            ...metricInputs,
                            [b.id]: parseFloat(e.target.value || "0"),
                          })
                        }
                      />
                      {typeof imp.percent === "number" && (
                        <div className="text-xs text-muted-foreground">
                          Improvement since first log: {imp.percent.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-2">
              <Label>How hard did it feel? (RPE 1-10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={rpe}
                onChange={(e) => setRpe(parseInt(e.target.value || "5", 10))}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Reflection Notes</Label>
              <Textarea
                placeholder="What did you notice?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              Discard
            </Button>
            <Button onClick={finish}>
              <Save className="h-4 w-4 mr-2" />
              Save Session
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Recent Sessions
          </h3>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Minutes"
                  dot={false}
                />
                <Line yAxisId="right" type="monotone" dataKey="RPE" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* =========================
   Root Page
   ========================= */

export default function Page() {
  const [plans, setPlans] = useLocalStorage<WorkoutPlan[]>(
    PLANS_KEY,
    DEFAULT_PLANS
  );
  const [logs, setLogs] = useLocalStorage<SessionLog[]>(LOGS_KEY, []);
  const [role, setRole] = useState<"student" | "instructor">("student");

  const addLog = (log: SessionLog) =>
    setLogs([log, ...logs].slice(0, 500)); // keep last 500

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Pre-Seminary Workout
            </h1>
            <p className="text-sm text-muted-foreground">
              Interactive, customizable 45-minute training with student & instructor dashboards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student View</SelectItem>
                <SelectItem value="instructor">Instructor View</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </header>

        <Tabs defaultValue="dash">
          <TabsList>
            <TabsTrigger value="dash">Dashboard</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
          </TabsList>
          <TabsContent value="dash">
            {role === "student" ? (
              <StudentDashboard plans={plans} addLog={addLog} />
            ) : (
              <InstructorDashboard plans={plans} setPlans={setPlans} />
            )}
          </TabsContent>
          <TabsContent value="plans">
            <div className="grid md:grid-cols-2 gap-4">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <footer className="text-xs text-muted-foreground pt-4">
          Data is stored locally for this prototype. Replace with your backend for multi-user support.
        </footer>
      </div>
    </div>
  );
}
