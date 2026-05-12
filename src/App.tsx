import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";

type Gender = "male" | "female" | "other";

type Member = {
  id: string;
  name: string;
  dob: string;
  deathDate: string;
  gender: Gender;
  image: string;
  spouseName: string;
  marriageDate: string;
  parentId: string;
  isAdopted: boolean;
  originalParentId: string;
  color: string;
  notes: string;
  location: {
    country: string;
    state: string;
    city: string;
  };
};

type Family = {
  id: string;
  name: string;
  members: Member[];
};

type TreeNode = d3.HierarchyPointNode<Member & { isVirtual?: boolean }>;

const STORAGE_KEY = "advanced-family-tree-platform-v1";
const EMBED_KEY = "__FAMILY_TREE_EMBED__";

const palette = [
  "#7c3aed",
  "#06b6d4",
  "#f97316",
  "#16a34a",
  "#e11d48",
  "#2563eb",
  "#c026d3",
  "#ca8a04",
  "#0891b2",
  "#dc2626",
];

const geo: Record<string, Record<string, string[]>> = {
  "United States": {
    California: ["Los Angeles", "San Francisco", "San Diego", "Sacramento"],
    Texas: ["Houston", "Austin", "Dallas", "San Antonio"],
    "New York": ["New York City", "Buffalo", "Albany", "Rochester"],
  },
  India: {
    Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik"],
    Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
    Karnataka: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi"],
  },
  "United Kingdom": {
    England: ["London", "Manchester", "Bristol", "Liverpool"],
    Scotland: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee"],
    Wales: ["Cardiff", "Swansea", "Newport", "Bangor"],
  },
  Canada: {
    Ontario: ["Toronto", "Ottawa", "Hamilton", "London"],
    Quebec: ["Montreal", "Quebec City", "Laval", "Gatineau"],
    Alberta: ["Calgary", "Edmonton", "Banff", "Red Deer"],
  },
};

const emptyMember: Member = {
  id: "",
  name: "",
  dob: "",
  deathDate: "",
  gender: "other",
  image: "",
  spouseName: "",
  marriageDate: "",
  parentId: "",
  isAdopted: false,
  originalParentId: "",
  color: palette[0],
  notes: "",
  location: { country: "", state: "", city: "" },
};

const demoFamily: Family = {
  id: "family-demo",
  name: "The Evergreen Family",
  members: [
    {
      ...emptyMember,
      id: "m1",
      name: "Arthur Evergreen",
      dob: "1942-04-12",
      gender: "male",
      spouseName: "Eleanor Hayes",
      marriageDate: "1965-06-18",
      color: palette[0],
      notes: "Founder of the family archive and lifelong gardener.",
      location: { country: "United States", state: "California", city: "Sacramento" },
    },
    {
      ...emptyMember,
      id: "m2",
      name: "Marcus Evergreen",
      dob: "1968-02-08",
      gender: "male",
      parentId: "m1",
      spouseName: "Priya Shah",
      marriageDate: "1992-09-03",
      color: palette[1],
      notes: "Architect and keeper of family letters.",
      location: { country: "United States", state: "Texas", city: "Austin" },
    },
    {
      ...emptyMember,
      id: "m3",
      name: "Lena Evergreen",
      dob: "1971-11-22",
      gender: "female",
      parentId: "m1",
      spouseName: "Daniel Brooks",
      marriageDate: "1996-05-21",
      color: palette[2],
      notes: "Her daughter lineage continues after marriage in this tree.",
      location: { country: "Canada", state: "Ontario", city: "Toronto" },
    },
    {
      ...emptyMember,
      id: "m4",
      name: "Nora Evergreen",
      dob: "1996-08-30",
      gender: "female",
      parentId: "m2",
      color: palette[3],
      location: { country: "United States", state: "Texas", city: "Dallas" },
    },
    {
      ...emptyMember,
      id: "m5",
      name: "Ava Brooks",
      dob: "1999-01-14",
      gender: "female",
      parentId: "m3",
      spouseName: "Jon Rivera",
      marriageDate: "2022-07-09",
      color: palette[4],
      location: { country: "Canada", state: "Ontario", city: "Ottawa" },
    },
    {
      ...emptyMember,
      id: "m6",
      name: "Leo Rivera",
      dob: "2024-05-04",
      gender: "male",
      parentId: "m5",
      color: palette[5],
      location: { country: "Canada", state: "Ontario", city: "Ottawa" },
    },
    {
      ...emptyMember,
      id: "m7",
      name: "Sam Evergreen",
      dob: "2002-12-02",
      gender: "other",
      parentId: "m2",
      isAdopted: true,
      originalParentId: "m3",
      color: palette[6],
      notes: "Adoptive relationship is shown with a solid line; biological link is dotted.",
      location: { country: "United States", state: "Texas", city: "Austin" },
    },
  ],
};

function id() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function year(date: string) {
  return date ? new Date(`${date}T00:00:00`).getFullYear().toString() : "";
}

function ageStatus(member: Member) {
  if (member.deathDate) return `${year(member.dob) || "?"}-${year(member.deathDate)}`;
  return year(member.dob) ? `b. ${year(member.dob)}` : "Dates unknown";
}

function locationText(member: Member) {
  return [member.location.city, member.location.state, member.location.country].filter(Boolean).join(", ") || "Location unknown";
}

function loadFamilies(): Family[] {
  const embedded = (window as unknown as Record<string, Family[] | undefined>)[EMBED_KEY];
  if (embedded?.length) return embedded;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Family[];
  } catch {
    // Fall through to demo data if a saved backup is malformed.
  }
  return [demoFamily];
}

function generationMap(members: Member[]) {
  const map = new Map<string, number>();
  const byParent = d3.group(members, (m) => m.parentId || "root");
  const walk = (parentId: string, generation: number) => {
    (byParent.get(parentId) || []).forEach((child) => {
      map.set(child.id, generation);
      walk(child.id, generation + 1);
    });
  };
  walk("root", 1);
  members.forEach((m) => !map.has(m.id) && map.set(m.id, 1));
  return map;
}

function birthdaySoon(member: Member) {
  if (!member.dob || member.deathDate) return false;
  const now = new Date();
  const b = new Date(`${member.dob}T00:00:00`);
  const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return (next.getTime() - now.getTime()) / 86400000 <= 30;
}

function createHierarchy(members: Member[]) {
  const virtualRoot = { ...emptyMember, id: "__root__", name: "Family", isVirtual: true };
  const byId = new Map(members.map((m) => [m.id, { ...m }]));
  const nodes = [{ ...virtualRoot }, ...members.map((m) => ({ ...m, parentId: byId.has(m.parentId) ? m.parentId : "__root__" }))];
  return d3
    .stratify<Member & { isVirtual?: boolean }>()
    .id((d) => d.id)
    .parentId((d) => (d.id === "__root__" ? undefined : d.parentId || "__root__"))(nodes);
}

function relationBetween(a: Member, b: Member, members: Member[]) {
  if (a.id === b.id) return "Same person";
  const byId = new Map(members.map((m) => [m.id, m]));
  const childrenOf = (idValue: string) => members.filter((m) => m.parentId === idValue || m.originalParentId === idValue);
  if (b.parentId === a.id) return a.gender === "female" ? "Mother" : a.gender === "male" ? "Father" : "Parent";
  if (a.parentId === b.id) return a.gender === "female" ? "Daughter" : a.gender === "male" ? "Son" : "Child";
  if (a.parentId && a.parentId === b.parentId) return a.gender === "female" ? "Sister" : a.gender === "male" ? "Brother" : "Sibling";
  const bParent = byId.get(b.parentId);
  if (bParent?.parentId === a.id) return a.gender === "female" ? "Grandmother" : a.gender === "male" ? "Grandfather" : "Grandparent";
  const aParent = byId.get(a.parentId);
  if (aParent?.parentId === b.id) return a.gender === "female" ? "Granddaughter" : a.gender === "male" ? "Grandson" : "Grandchild";
  const bGrand = bParent ? byId.get(bParent.parentId) : undefined;
  if (bGrand && childrenOf(bGrand.id).some((child) => child.id === a.parentId)) {
    return a.gender === "female" ? "Aunt" : a.gender === "male" ? "Uncle" : "Parent's sibling";
  }
  const aGrand = aParent ? byId.get(aParent.parentId) : undefined;
  if (aGrand && bGrand && aGrand.id === bGrand.id) return "Cousin";
  return "Extended or unknown relationship";
}

export default function App() {
  const [families, setFamilies] = useState<Family[]>(loadFamilies);
  const [activeFamilyId, setActiveFamilyId] = useState(() => loadFamilies()[0]?.id || demoFamily.id);
  const [selectedId, setSelectedId] = useState<string>("");
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<Member>(emptyMember);
  const [search, setSearch] = useState("");
  const [aliveFilter, setAliveFilter] = useState<"all" | "alive" | "deceased">("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [generationFilter, setGenerationFilter] = useState("all");
  const [relationA, setRelationA] = useState("");
  const [relationB, setRelationB] = useState("");
  const [focusId, setFocusId] = useState("");
  const [history, setHistory] = useState<Family[][]>([]);
  const [future, setFuture] = useState<Family[][]>([]);
  const [notice, setNotice] = useState("Auto-saved locally");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const activeFamily = families.find((f) => f.id === activeFamilyId) || families[0] || demoFamily;
  const members = activeFamily.members;
  const generations = useMemo(() => generationMap(members), [members]);
  const selected = members.find((m) => m.id === selectedId) || null;

  const commitFamilies = useCallback(
    (next: Family[], message = "Changes saved") => {
      setHistory((h) => [...h.slice(-19), families]);
      setFuture([]);
      setFamilies(next);
      setNotice(message);
    },
    [families],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(families));
    const t = window.setTimeout(() => setNotice("Auto-saved locally"), 1600);
    return () => window.clearTimeout(t);
  }, [families]);

  useEffect(() => {
    if (!svgRef.current || !graphRef.current) return;
    const svg = d3.select(svgRef.current);
    const graph = d3.select(graphRef.current);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 2.4])
      .on("zoom", (event) => graph.attr("transform", event.transform.toString()));
    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(560, 80).scale(0.86));
    return () => {
      svg.on(".zoom", null);
    };
  }, [activeFamilyId, focusId]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.notes.toLowerCase().includes(q);
      const matchesAlive = aliveFilter === "all" || (aliveFilter === "alive" ? !m.deathDate : Boolean(m.deathDate));
      const matchesLocation = !locationFilter || locationText(m).toLowerCase().includes(locationFilter.toLowerCase());
      const matchesGeneration = generationFilter === "all" || generations.get(m.id)?.toString() === generationFilter;
      return matchesSearch && matchesAlive && matchesLocation && matchesGeneration;
    });
  }, [aliveFilter, generationFilter, generations, locationFilter, members, search]);

  const visibleIds = useMemo(() => new Set(filteredMembers.map((m) => m.id)), [filteredMembers]);

  const chartMembers = useMemo(() => {
    if (!focusId) return members;
    const include = new Set<string>([focusId]);
    const focused = members.find((m) => m.id === focusId);
    if (focused?.parentId) include.add(focused.parentId);
    if (focused?.originalParentId) include.add(focused.originalParentId);
    members.forEach((m) => {
      if (m.parentId === focusId || m.originalParentId === focusId) {
        include.add(m.id);
        members.forEach((g) => {
          if (g.parentId === m.id || g.originalParentId === m.id) include.add(g.id);
        });
      }
    });
    return members.filter((m) => include.has(m.id));
  }, [focusId, members]);

  const tree = useMemo(() => {
    const root = createHierarchy(chartMembers);
    return d3.tree<Member & { isVirtual?: boolean }>().nodeSize([230, 180])(root);
  }, [chartMembers]);

  const nodes = tree.descendants().filter((d) => !d.data.isVirtual) as TreeNode[];
  const links = tree.links().filter((l) => !l.source.data.isVirtual && !l.target.data.isVirtual);
  const biologicalLinks = chartMembers
    .filter((m) => m.isAdopted && m.originalParentId && chartMembers.some((p) => p.id === m.originalParentId))
    .map((child) => {
      const source = nodes.find((n) => n.data.id === child.originalParentId);
      const target = nodes.find((n) => n.data.id === child.id);
      return source && target ? { source, target } : null;
    })
    .filter(Boolean) as { source: TreeNode; target: TreeNode }[];

  const stats = useMemo(
    () => ({
      total: members.length,
      generations: Math.max(0, ...Array.from(generations.values())),
      alive: members.filter((m) => !m.deathDate).length,
      birthdays: members.filter(birthdaySoon),
    }),
    [generations, members],
  );

  const updateActiveFamily = (updater: (family: Family) => Family, message?: string) => {
    commitFamilies(families.map((family) => (family.id === activeFamily.id ? updater(family) : family)), message);
  };

  const openAdd = () => {
    setForm({ ...emptyMember, id: id(), color: palette[members.length % palette.length] });
    setModalMode("add");
  };

  const openEdit = (member: Member) => {
    setForm({ ...member, location: { ...member.location } });
    setModalMode("edit");
  };

  const submitMember = (event: FormEvent) => {
    event.preventDefault();
    const clean = { ...form, name: form.name.trim() || "Unnamed member" };
    updateActiveFamily(
      (family) => ({
        ...family,
        members: modalMode === "edit" ? family.members.map((m) => (m.id === clean.id ? clean : m)) : [...family.members, clean],
      }),
      modalMode === "edit" ? "Member updated" : "Member added",
    );
    setSelectedId(clean.id);
    setModalMode(null);
  };

  const deleteMember = (member: Member) => {
    if (!window.confirm(`Delete ${member.name}? Children will be moved to the root generation.`)) return;
    updateActiveFamily(
      (family) => ({
        ...family,
        members: family.members
          .filter((m) => m.id !== member.id)
          .map((m) => ({
            ...m,
            parentId: m.parentId === member.id ? "" : m.parentId,
            originalParentId: m.originalParentId === member.id ? "" : m.originalParentId,
          })),
      }),
      "Member deleted",
    );
    setSelectedId("");
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    if (!image) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, image: String(reader.result) }));
    reader.readAsDataURL(image);
  };

  const createFamily = () => {
    const name = window.prompt("New family name", "Untitled Family");
    if (!name) return;
    const next = { id: id(), name, members: [] };
    commitFamilies([...families, next], "Family created");
    setActiveFamilyId(next.id);
    setSelectedId("");
    setFocusId("");
  };

  const renameFamily = () => {
    const name = window.prompt("Rename family", activeFamily.name);
    if (!name) return;
    commitFamilies(families.map((f) => (f.id === activeFamily.id ? { ...f, name } : f)), "Family renamed");
  };

  const deleteFamily = () => {
    if (families.length === 1) return window.alert("At least one family must remain.");
    if (!window.confirm(`Delete ${activeFamily.name}?`)) return;
    const next = families.filter((f) => f.id !== activeFamily.id);
    commitFamilies(next, "Family deleted");
    setActiveFamilyId(next[0].id);
  };

  const exportJson = () => download(`family-backup-${Date.now()}.json`, JSON.stringify(families, null, 2), "application/json");

  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Family[];
        if (!Array.isArray(parsed)) throw new Error("Backup must be an array of families");
        commitFamilies(parsed, "Backup imported");
        setActiveFamilyId(parsed[0]?.id || activeFamilyId);
      } catch (error) {
        window.alert(`Could not import backup: ${(error as Error).message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const download = (filename: string, content: string | Blob, type = "text/plain") => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(350)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(560, 80).scale(0.86));
  };

  const stepZoom = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, factor);
  };

  const exportPng = async (maleOnly = false) => {
    if (!viewportRef.current) return;
    const dataUrl = await toPng(viewportRef.current, {
      pixelRatio: 2.4,
      backgroundColor: "#07111f",
      filter: (node) => !maleOnly || !(node instanceof HTMLElement) || node.dataset.gender !== "female",
    });
    download(maleOnly ? "male-lineage-tree.png" : "family-tree.png", await (await fetch(dataUrl)).blob());
  };

  const exportPdf = async (maleOnly = false) => {
    if (!viewportRef.current) return;
    const dataUrl = await toPng(viewportRef.current, { pixelRatio: 2, backgroundColor: "#07111f" });
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdf.setFillColor(7, 17, 31);
    pdf.rect(0, 0, 842, 595, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.text(`${activeFamily.name} ${maleOnly ? "Male Lineage" : "Full Family Tree"}`, 36, 36);
    pdf.addImage(dataUrl, "PNG", 28, 56, 786, 450);
    const details = maleOnly ? members.filter((m) => m.gender === "male") : members;
    details.forEach((m, index) => {
      if (index % 6 === 0) {
        pdf.addPage("a4", "landscape");
        pdf.setTextColor(24, 31, 46);
        pdf.setFontSize(18);
        pdf.text("Member Detail Pages", 36, 38);
      }
      const y = 72 + (index % 6) * 78;
      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(13);
      pdf.text(`${m.name} - ${ageStatus(m)} - Gen ${generations.get(m.id) || 1}`, 42, y);
      pdf.setFontSize(10);
      pdf.text(`Location: ${locationText(m)} | Spouse: ${m.spouseName || "None"}`, 42, y + 17);
      pdf.text(`Notes: ${(m.notes || "No notes").slice(0, 125)}`, 42, y + 34);
    });
    pdf.save(maleOnly ? "male-lineage-family-tree.pdf" : "family-tree.pdf");
  };

  const saveForGithub = () => {
    const safe = JSON.stringify([activeFamily]).replace(/</g, "\\u003c");
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${activeFamily.name}</title><style>body{margin:0;font-family:Inter,system-ui;background:#07111f;color:white}.wrap{min-height:100vh;padding:32px;background:radial-gradient(circle at top,#22345f,#07111f 58%)}.node{position:absolute;width:180px;padding:14px;border-radius:20px;color:white;box-shadow:0 18px 50px #0008}svg{position:absolute;inset:0;overflow:visible}.stage{position:relative;min-width:1100px;min-height:720px}.meta{opacity:.8;font-size:12px}h1{font-size:34px}</style></head><body><div class="wrap"><h1>${activeFamily.name}</h1><p>Static GitHub Pages family chart generated from the app. Data is embedded in this HTML file.</p><div id="stage" class="stage"></div></div><script>const families=${safe};const members=families[0].members;const stage=document.getElementById('stage');const byParent=Object.groupBy?Object.groupBy(members,m=>m.parentId||'root'):members.reduce((a,m)=>((a[m.parentId||'root']??=[]).push(m),a),{});let x=40;function walk(parent,depth){(byParent[parent]||[]).forEach((m,i)=>{const left=x;const top=depth*170+30;x+=220;const el=document.createElement('div');el.className='node';el.style.left=left+'px';el.style.top=top+'px';el.style.background='linear-gradient(135deg,'+m.color+',#111827)';el.innerHTML='<b>'+m.name+'</b><div class=meta>'+(m.dob||'')+' '+(m.deathDate?'- '+m.deathDate:'')+'</div><div class=meta>'+[m.location?.city,m.location?.state,m.location?.country].filter(Boolean).join(', ')+'</div>';stage.appendChild(el);walk(m.id,depth+1);});}walk('root',0);</script></body></html>`;
    download(`${activeFamily.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-github-pages.html`, html, "text/html");
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((f) => [families, ...f]);
    setHistory((h) => h.slice(0, -1));
    setFamilies(previous);
    setNotice("Undo applied");
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((h) => [...h, families]);
    setFuture((f) => f.slice(1));
    setFamilies(next);
    setNotice("Redo applied");
  };

  const firstRelationMember = members.find((m) => m.id === relationA);
  const secondRelationMember = members.find((m) => m.id === relationB);
  const relationResult = firstRelationMember && secondRelationMember ? relationBetween(firstRelationMember, secondRelationMember, members) : "Select two members";

  const countryStates = form.location.country ? Object.keys(geo[form.location.country] || {}) : [];
  const cityOptions = form.location.country && form.location.state ? geo[form.location.country]?.[form.location.state] || [] : [];

  return (
    <div className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,.36),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,.24),transparent_30%),linear-gradient(135deg,#07111f,#101827_56%,#170f2c)]" />
      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
        <aside className="z-10 border-white/10 bg-white/8 p-4 shadow-2xl backdrop-blur-xl lg:border-r">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[.34em] text-cyan-200">Genealogy Studio</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">LineageOS</h1>
            </div>
            <span className="rounded-full border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200">{notice}</span>
          </div>

          <div className="space-y-3">
            <select className="field" value={activeFamily.id} onChange={(e) => setActiveFamilyId(e.target.value)}>
              {families.map((family) => (
                <option key={family.id} value={family.id}>{family.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <button className="soft-button" onClick={createFamily}>New</button>
              <button className="soft-button" onClick={renameFamily}>Rename</button>
              <button className="soft-button danger" onClick={deleteFamily}>Delete</button>
            </div>
            <button className="primary-button w-full" onClick={openAdd}>Add Member</button>
          </div>

          <section className="mt-6 space-y-3">
            <h2 className="section-title">Search and Filters</h2>
            <input className="field" placeholder="Search name or notes" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className="field" value={aliveFilter} onChange={(e) => setAliveFilter(e.target.value as typeof aliveFilter)}>
                <option value="all">All life status</option>
                <option value="alive">Alive</option>
                <option value="deceased">Deceased</option>
              </select>
              <select className="field" value={generationFilter} onChange={(e) => setGenerationFilter(e.target.value)}>
                <option value="all">All generations</option>
                {Array.from(new Set(Array.from(generations.values()))).sort().map((g) => <option key={g} value={g}>Generation {g}</option>)}
              </select>
            </div>
            <input className="field" placeholder="Filter by location" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
          </section>

          <section className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="Members" value={stats.total} />
            <Stat label="Generations" value={stats.generations} />
            <Stat label="Alive" value={stats.alive} />
            <Stat label="Birthdays" value={stats.birthdays.length} />
          </section>

          <section className="mt-6">
            <h2 className="section-title">Member List</h2>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
              {filteredMembers.map((member) => (
                <button key={member.id} className={`member-row ${selectedId === member.id ? "active" : ""}`} onClick={() => setSelectedId(member.id)}>
                  <span className="h-3 w-3 rounded-full" style={{ background: member.color }} />
                  <span className="min-w-0 flex-1 truncate text-left">{member.name}</span>
                  <span className="text-xs text-white/50">G{generations.get(member.id)}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="relative z-0 min-h-[680px] overflow-hidden">
          <div className="absolute left-5 right-5 top-5 z-20 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/50 px-4 py-3 backdrop-blur-xl">
            <div>
              <p className="text-xs uppercase tracking-[.28em] text-violet-200">{focusId ? "Focused family chart" : "Main interactive tree"}</p>
              <h2 className="text-xl font-bold">{activeFamily.name}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="soft-button" onClick={() => stepZoom(1.18)}>Zoom In</button>
              <button className="soft-button" onClick={() => stepZoom(0.84)}>Zoom Out</button>
              <button className="soft-button" onClick={resetZoom}>Reset Zoom</button>
              {focusId && <button className="primary-button" onClick={() => setFocusId("")}>Back to Main Tree</button>}
            </div>
          </div>

          {focusId && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="absolute left-6 top-28 z-20 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm backdrop-blur-xl">
              Main Tree / {members.find((m) => m.id === focusId)?.name || "Member"} / Parents, children, grandchildren
            </motion.div>
          )}

          <div ref={viewportRef} className="h-full min-h-screen w-full pt-20">
            <svg ref={svgRef} className="h-full min-h-screen w-full cursor-grab active:cursor-grabbing">
              <defs>
                <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <g ref={graphRef}>
                {links.map((link) => (
                  <motion.path
                    key={`${link.source.data.id}-${link.target.data.id}`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    d={`M${link.source.x},${link.source.y + 62} C${link.source.x},${(link.source.y + link.target.y) / 2} ${link.target.x},${(link.source.y + link.target.y) / 2} ${link.target.x},${link.target.y - 62}`}
                    fill="none"
                    stroke="rgba(255,255,255,.42)"
                    strokeWidth="2.5"
                  />
                ))}
                {biologicalLinks.map((link) => (
                  <path key={`bio-${link.source.data.id}-${link.target.data.id}`} d={`M${link.source.x + 28},${link.source.y + 62} C${link.source.x + 80},${(link.source.y + link.target.y) / 2} ${link.target.x - 80},${(link.source.y + link.target.y) / 2} ${link.target.x - 28},${link.target.y - 62}`} fill="none" stroke="#facc15" strokeDasharray="7 8" strokeWidth="2.5" />
                ))}
                {nodes.map((node) => {
                  const member = node.data;
                  const isMatch = visibleIds.has(member.id);
                  return (
                    <foreignObject key={member.id} x={node.x - 98} y={node.y - 64} width="196" height="132" className="overflow-visible">
                      <motion.button
                        data-gender={member.gender}
                        title={`${member.name} - ${locationText(member)}`}
                        initial={{ opacity: 0, scale: 0.82, y: 12 }}
                        animate={{ opacity: isMatch ? 1 : 0.28, scale: selectedId === member.id ? 1.06 : 1, y: 0 }}
                        whileHover={{ scale: 1.06, y: -5 }}
                        onClick={() => setSelectedId(member.id)}
                        className={`node-card ${selectedId === member.id ? "selected" : ""}`}
                        style={{ background: `linear-gradient(135deg, ${member.color}, #111827 78%)`, boxShadow: `0 18px 48px ${member.color}55` }}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar member={member} large={false} />
                          <div className="min-w-0 text-left">
                            <p className="truncate text-sm font-black">{member.name}</p>
                            <p className="text-[11px] text-white/75">{ageStatus(member)}</p>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-white/78">
                          <span>{member.gender}</span>
                          <span>Gen {generations.get(member.id) || 1}</span>
                          <span className="truncate col-span-2">{locationText(member)}</span>
                          <span className="truncate col-span-2">{member.spouseName ? `Married: ${member.spouseName}` : "No spouse added"}</span>
                        </div>
                        {member.isAdopted && <span className="adoption-badge">Adopted</span>}
                      </motion.button>
                    </foreignObject>
                  );
                })}
              </g>
            </svg>
          </div>
        </main>

        <aside className="z-10 border-white/10 bg-white/8 p-4 shadow-2xl backdrop-blur-xl lg:border-l">
          <section>
            <h2 className="section-title">Relationship Detector</h2>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <select className="field" value={relationA} onChange={(e) => setRelationA(e.target.value)}>
                <option value="">First member</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select className="field" value={relationB} onChange={(e) => setRelationB(e.target.value)}>
                <option value="">Second member</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <motion.div layout className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-center">
                <p className="text-xs uppercase tracking-[.25em] text-cyan-100">Relationship</p>
                <p className="mt-1 text-2xl font-black">{relationResult}</p>
              </motion.div>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-2">
            <button className="soft-button" onClick={undo} disabled={!history.length}>Undo</button>
            <button className="soft-button" onClick={redo} disabled={!future.length}>Redo</button>
            <button className="soft-button" onClick={() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(families)); setNotice("Manual save complete"); }}>Save</button>
            <button className="soft-button" onClick={exportJson}>Export JSON</button>
            <button className="soft-button" onClick={() => fileRef.current?.click()}>Import JSON</button>
            <button className="soft-button" onClick={saveForGithub}>Save for GitHub</button>
            <button className="soft-button" onClick={() => exportPng(false)}>PNG All</button>
            <button className="soft-button" onClick={() => exportPng(true)}>PNG Male</button>
            <button className="soft-button" onClick={() => exportPdf(false)}>PDF All</button>
            <button className="soft-button" onClick={() => exportPdf(true)}>PDF Male</button>
            <input ref={fileRef} className="hidden" type="file" accept="application/json" onChange={importJson} />
          </section>

          <AnimatePresence mode="wait">
            {selected ? (
              <motion.section key={selected.id} initial={{ opacity: 0, x: 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 35 }} className="detail-panel mt-5">
                <div className="flex items-start gap-4">
                  <Avatar member={selected} large />
                  <div className="min-w-0">
                    <h2 className="break-words text-2xl font-black">{selected.name}</h2>
                    <p className="text-sm text-white/65">Generation {generations.get(selected.id) || 1} - {selected.gender}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3 text-sm text-white/78">
                  <Detail label="Dates" value={ageStatus(selected)} />
                  <Detail label="Location" value={locationText(selected)} />
                  <Detail label="Spouse" value={selected.spouseName || "No spouse recorded"} />
                  <Detail label="Marriage" value={selected.marriageDate || "No marriage date"} />
                  <Detail label="Children" value={members.filter((m) => m.parentId === selected.id).map((m) => m.name).join(", ") || "No children recorded"} />
                  <Detail label="Adoption" value={selected.isAdopted ? `Adopted. Biological parent: ${members.find((m) => m.id === selected.originalParentId)?.name || "Unknown"}` : "Not marked adopted"} />
                  <Detail label="Biography" value={selected.notes || "No biography added yet."} />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <button className="primary-button" onClick={() => openEdit(selected)}>Edit</button>
                  <button className="soft-button danger" onClick={() => deleteMember(selected)}>Delete</button>
                  <button className="soft-button" onClick={() => setFocusId(selected.id)}>View Family Chart</button>
                </div>
              </motion.section>
            ) : (
              <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="detail-panel mt-5 text-white/70">
                Select a person to open their animated detail panel, edit records, or launch a focused family chart.
              </motion.section>
            )}
          </AnimatePresence>
        </aside>
      </div>

      <AnimatePresence>
        {modalMode && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form onSubmit={submitMember} initial={{ opacity: 0, y: 35, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 35, scale: 0.97 }} className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[2rem] border border-white/15 bg-slate-950/90 p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[.3em] text-violet-200">{modalMode === "add" ? "Add record" : "Edit record"}</p>
                  <h2 className="text-3xl font-black">Member Profile</h2>
                </div>
                <button type="button" className="soft-button" onClick={() => setModalMode(null)}>Close</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="label">Full Name<input required className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label className="label">Gender<select className="field mt-1" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                <label className="label">Date of Birth<input type="date" className="field mt-1" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></label>
                <label className="label">Death Date<input type="date" className="field mt-1" value={form.deathDate} onChange={(e) => setForm({ ...form, deathDate: e.target.value })} /></label>
                <label className="label">Parent Selection<select className="field mt-1" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><option value="">Root generation</option>{members.filter((m) => m.id !== form.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                <label className="label">Color<input type="color" className="field mt-1 h-11" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
                <label className="label">Spouse Name<input className="field mt-1" value={form.spouseName} onChange={(e) => setForm({ ...form, spouseName: e.target.value })} /></label>
                <label className="label">Marriage Date<input type="date" className="field mt-1" value={form.marriageDate} onChange={(e) => setForm({ ...form, marriageDate: e.target.value })} /></label>
                <label className="label">Country<select className="field mt-1" value={form.location.country} onChange={(e) => setForm({ ...form, location: { country: e.target.value, state: "", city: "" } })}><option value="">Select country</option>{Object.keys(geo).map((country) => <option key={country}>{country}</option>)}</select></label>
                <label className="label">State<select className="field mt-1" value={form.location.state} onChange={(e) => setForm({ ...form, location: { ...form.location, state: e.target.value, city: "" } })}><option value="">Select state</option>{countryStates.map((state) => <option key={state}>{state}</option>)}</select></label>
                <label className="label">City<input list="city-options" className="field mt-1" value={form.location.city} onChange={(e) => setForm({ ...form, location: { ...form.location, city: e.target.value } })} /><datalist id="city-options">{cityOptions.map((city) => <option key={city} value={city} />)}</datalist></label>
                <label className="label">Profile Picture Upload<input type="file" accept="image/*" className="field mt-1" onChange={handleImage} /></label>
                <label className="label flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"><input type="checkbox" checked={form.isAdopted} onChange={(e) => setForm({ ...form, isAdopted: e.target.checked })} /> Is Adopted Child?</label>
                <label className="label">Biological Original Parent<select className="field mt-1" value={form.originalParentId} onChange={(e) => setForm({ ...form, originalParentId: e.target.value })}><option value="">None</option>{members.filter((m) => m.id !== form.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                <label className="label md:col-span-2">Notes / Biography<textarea className="field mt-1 min-h-28" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              </div>
              <button className="primary-button mt-5 w-full py-3" type="submit">Save Member</button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Avatar({ member, large }: { member: Member; large: boolean }) {
  const size = large ? "h-24 w-24 text-3xl" : "h-11 w-11 text-base";
  return member.image ? <img className={`${size} rounded-2xl object-cover ring-2 ring-white/30`} src={member.image} alt={member.name} /> : <div className={`${size} grid shrink-0 place-items-center rounded-2xl font-black ring-2 ring-white/30`} style={{ background: member.color }}>{member.name.slice(0, 1) || "?"}</div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <motion.div whileHover={{ y: -3 }} className="rounded-3xl border border-white/10 bg-white/10 p-4"><p className="text-xs uppercase tracking-[.2em] text-white/50">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></motion.div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase tracking-[.22em] text-white/45">{label}</p><p className="mt-1 leading-relaxed">{value}</p></div>;
}
