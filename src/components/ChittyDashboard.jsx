import React, { useMemo, useState, useEffect } from "react";
import { WidthProvider, Responsive } from "react-grid-layout";
import { motion } from "framer-motion";
import { Plus, Save, Upload, Download, Trash2, Grid, RefreshCcw } from "lucide-react";

// NOTE: This file is a self-contained dashboard workbench.
// - Drag panels by the header to rearrange.
// - Resize from corners.
// - Add/remove panels from the Catalog.
// - Persist/restore layout via localStorage or JSON import/export.
// Tailwind + shadcn/ui are available in this environment.

const ResponsiveGridLayout = WidthProvider(Responsive);

// Default widgets representing Chitty ecosystem areas
const DEFAULT_WIDGETS = [
  { key: "router", title: "ChittyRouter • AI Orchestration", color: "bg-sky-50", content: "Events, triage decisions, routes. 6 agent patterns: case_analysis, document_review, client_communication, court_preparation, evidence_processing, intake_processing." },
  { key: "chat", title: "ChittyChat • Project & Case Threads", color: "bg-emerald-50", content: "Rooms, topics, messages. Real-time collaboration across legal teams." },
  { key: "ledger", title: "ChittyLedger • Evidence", color: "bg-amber-50", content: "Artifacts, envelopes, custody. 8-tier evidence classification with immutable audit trails." },
  { key: "trust", title: "ChittyTrust • 6D Trust Engine", color: "bg-indigo-50", content: "Source, Temporal, Channel, Outcome, Network, Justice. Identity verification and trust scoring." },
  { key: "chain", title: "ChittyChain • Blockchain Anchors", color: "bg-fuchsia-50", content: "Anchors, proofs, block refs. Immutable logging with Durable Objects: CHITTYCHAIN_DO." },
  { key: "assets", title: "ChittyAssets • Real Assets", color: "bg-rose-50", content: "Intake, EXIF, valuation, freeze period. AI-powered document verification with blockchain proof." },
  { key: "trace", title: "ChittyTrace • Financial Forensics", color: "bg-lime-50", content: "Flows, exhibits, filings. Cook County court filing integration." },
  { key: "schema", title: "ChittySchema • Data Models", color: "bg-cyan-50", content: "Evidence envelope, topics, IDs. ChittyID format: VV-G-LLL-SSSS-T-YM-C-X." },
  { key: "id", title: "ChittyID • Identity Management", color: "bg-violet-50", content: "IDs from id.chitty.cc service, validation, pipeline: Router → Intake → Trust → Authorization." },
  { key: "verify", title: "ChittyVerify • Document Verification", color: "bg-teal-50", content: "KYC, auth flows, attestations. AI models: @cf/meta/llama-3.1-8b-instruct, @cf/microsoft/resnet-50, @cf/openai/whisper." },
  { key: "gov", title: "ChittyGov • Governance & Compliance", color: "bg-orange-50", content: "Policies, SOPs, metrics. Wyoming LLC formation pipeline." },
  { key: "ops", title: "ChittyOps • System Observability", color: "bg-stone-50", content: "Queues, metrics, alerts. Cloudflare Workers AI Gateway with 30-second CPU limit." },
  { key: "notion", title: "NotionSync • AtomicFacts Bridge", color: "bg-purple-50", content: "ChittyRouter → EvidenceEnvelope → AtomicFacts → Notion. Hardened sync with DLQ, rate limiting, idempotency." },
  { key: "session", title: "SessionSync • Cross-Service State", color: "bg-blue-50", content: "Session state across ChittyOS services. Pipeline orchestration, context bridge, recovery checkpoints." },
  { key: "topic", title: "TopicSync • Conversation Flow", color: "bg-green-50", content: "Topic-based conversation sync. Vector embeddings, continuity tracking, semantic search." }
];

const DEFAULT_LAYOUT = DEFAULT_WIDGETS.map((w, i) => ({
  i: w.key,
  x: (i % 4) * 3,
  y: Math.floor(i / 4) * 4,
  w: 3,
  h: 4,
  minW: 2,
  minH: 3,
}));

const LS_KEY = "chitty-dashboard-v3-layout";

function Panel({ id, title, color, content, onRemove, onTitle }) {
  return (
    <motion.div
      layout
      className={`h-full w-full ${color} rounded-2xl shadow-sm border border-black/5 flex flex-col`}
    >
      <div className="cursor-move select-none px-3 py-2 flex items-center justify-between border-b border-black/10 bg-white/60 rounded-t-2xl">
        <input
          className="bg-transparent font-semibold text-sm focus:outline-none w-full"
          defaultValue={title}
          onBlur={(e) => onTitle?.(id, e.target.value)}
        />
        <button
          onClick={() => onRemove?.(id)}
          className="ml-2 p-1 rounded hover:bg-black/5"
          title="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 text-sm text-black/80 overflow-auto">
        {content}
      </div>
    </motion.div>
  );
}

export default function ChittyDashboard() {
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [layouts, setLayouts] = useState({ lg: DEFAULT_LAYOUT });

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.layouts && parsed.widgets) {
        setLayouts(parsed.layouts);
        setWidgets(parsed.widgets);
      }
    } catch {}
  }, []);

  // Persist to localStorage
  const persist = (nextLayouts = layouts, nextWidgets = widgets) => {
    localStorage.setItem(LS_KEY, JSON.stringify({ layouts: nextLayouts, widgets: nextWidgets }));
  };

  const widgetMap = useMemo(() => new Map(widgets.map(w => [w.key, w])), [widgets]);

  const onLayoutChange = (_cur, all) => {
    const next = { lg: all }; // we use single breakpoint for simplicity
    setLayouts(next);
    persist(next, widgets);
  };

  const removeWidget = (key) => {
    const nextWidgets = widgets.filter(w => w.key !== key);
    const nextLayout = (layouts.lg || []).filter(l => l.i !== key);
    const next = { lg: nextLayout };
    setWidgets(nextWidgets);
    setLayouts(next);
    persist(next, nextWidgets);
  };

  const renameWidget = (key, title) => {
    const nextWidgets = widgets.map(w => (w.key === key ? { ...w, title } : w));
    setWidgets(nextWidgets);
    persist(layouts, nextWidgets);
  };

  const addWidget = (w) => {
    const exists = widgets.some(x => x.key === w.key);
    const key = exists ? `${w.key}-${Date.now().toString(36)}` : w.key;
    const base = { ...w, key };
    const nextWidgets = [...widgets, base];
    const nextLayout = [
      ...(layouts.lg || []),
      { i: key, x: 0, y: Infinity, w: 3, h: 4, minW: 2, minH: 3 },
    ];
    const next = { lg: nextLayout };
    setWidgets(nextWidgets);
    setLayouts(next);
    persist(next, nextWidgets);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ layouts, widgets }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chitty-dashboard-ecosystem.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed.layouts && parsed.widgets) {
          setLayouts(parsed.layouts);
          setWidgets(parsed.widgets);
          persist(parsed.layouts, parsed.widgets);
        }
      } catch {}
    };
    reader.readAsText(file);
  };

  const resetLayout = () => {
    setLayouts({ lg: DEFAULT_LAYOUT });
    setWidgets(DEFAULT_WIDGETS);
    persist({ lg: DEFAULT_LAYOUT }, DEFAULT_WIDGETS);
  };

  return (
    <div className="min-h-screen w-full flex flex-col gap-3 p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xl font-bold mr-auto">ChittyOS Ecosystem Workbench</div>
        <div className="text-sm text-gray-600">51+ Active Modules | AI Gateway Integration | Pipeline Orchestration</div>
        <button className="px-3 py-2 rounded-xl bg-black text-white flex items-center gap-2" onClick={() => addWidget({ key: `note-${Date.now()}`, title: "Freeform Note", color: "bg-white", content: "Use this to jot ideas." })}>
          <Plus className="h-4 w-4" /> Add Note
        </button>
        <button className="px-3 py-2 rounded-xl bg-white border flex items-center gap-2" onClick={resetLayout}>
          <RefreshCcw className="h-4 w-4" /> Reset
        </button>
        <label className="px-3 py-2 rounded-xl bg-white border flex items-center gap-2 cursor-pointer">
          <Upload className="h-4 w-4" /> Import
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files && importJSON(e.target.files[0])} />
        </label>
        <button className="px-3 py-2 rounded-xl bg-white border flex items-center gap-2" onClick={exportJSON}>
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {/* Catalog */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-2">
        {DEFAULT_WIDGETS.map((w) => (
          <button key={w.key} onClick={() => addWidget(w)} className="text-left p-3 rounded-xl border bg-white hover:bg-black/5">
            <div className="text-sm font-semibold flex items-center gap-2"><Grid className="h-4 w-4" /> {w.title}</div>
            <div className="text-xs text-black/60 mt-1">{w.content}</div>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="bg-white rounded-2xl border shadow-inner p-2">
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 8, xs: 6, xxs: 4 }}
          rowHeight={28}
          onLayoutChange={onLayoutChange}
          isBounded
          draggableHandle=".cursor-move"
        >
          {(layouts.lg || []).map((l) => {
            const w = widgetMap.get(l.i) || { key: l.i, title: l.i, color: "bg-white", content: "Untitled" };
            return (
              <div key={l.i} className="h-full">
                <Panel
                  id={w.key}
                  title={w.title}
                  color={w.color}
                  content={w.content}
                  onRemove={removeWidget}
                  onTitle={renameWidget}
                />
              </div>
            );
          })}
        </ResponsiveGridLayout>
      </div>

      {/* Footer */}
      <div className="text-xs text-black/60 flex items-center gap-3">
        <Save className="h-4 w-4" /> Layout auto-saves to localStorage. Drag to reorder. Resize corners. Import/Export JSON to version.
        <span className="ml-auto">ChittyID Mothership • id.chitty.cc • Powered by ChittyRouter AI Gateway</span>
      </div>
    </div>
  );
}