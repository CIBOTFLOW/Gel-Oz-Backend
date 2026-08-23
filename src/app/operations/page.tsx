import PlanningWorkbench from "@/components/PlanningWorkbench";
import { createFreightPlan } from "@/modules/operations/planning";
import { samplePlanningRequest } from "@/modules/operations/sample-data";

const inbounds = [
  { ref: "ASN-481", origin: "Istanbul", eta: "Today · 14:30", units: "14 pallets", state: "Dock 2 confirmed", tone: "good" },
  { ref: "ASN-486", origin: "Como", eta: "Tomorrow · 09:00", units: "8 pallets", state: "Packing list missing", tone: "warn" },
  { ref: "ASN-490", origin: "Bursa", eta: "Mon · 11:30", units: "22 pallets", state: "Awaiting appointment", tone: "neutral" },
];

const work = [
  { task: "Repack GO-1048", zone: "Italy · QC", owner: "Shift A", due: "12:20", priority: "Urgent" },
  { task: "Photo inspection GO-1051", zone: "Turkey · Receiving", owner: "Ayşe K.", due: "14:00", priority: "Standard" },
  { task: "Build pallet PLT-003", zone: "Turkey · Bay 4", owner: "Shift B", due: "16:40", priority: "Standard" },
];

const signals = [
  { label: "Container utilization", value: "72%", change: "+9 pts", hint: "next sailing" },
  { label: "Dock backlog", value: "3.1 hr", change: "−0.6 hr", hint: "7-day average" },
  { label: "Damage / repack", value: "2.4%", change: "+0.3 pts", hint: "30-day rate" },
  { label: "On-time last mile", value: "94.8%", change: "+1.7 pts", hint: "verified POD" },
];

export default function OperationsPage() {
  const plan = createFreightPlan(samplePlanningRequest);
  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark">GÖ</span><div><strong>Gel Öz</strong><small>Operations control</small></div></div>
        <nav aria-label="Primary"><a className="active" href="#overview">Operations</a><a href="#">Network</a><a href="#">Customers</a><a href="#">Finance</a></nav>
        <div className="topActions"><span className="liveDot">Live</span><button className="secondary">Create intake</button><span className="avatar">CS</span></div>
      </header>

      <div className="shell" id="overview">
        <aside>
          <p className="asideLabel">Operations</p>
          <a className="selected" href="#overview">Control tower <span>8</span></a>
          <a href="#planner">Consolidation</a>
          <a href="#receiving">Receiving <span>3</span></a>
          <a href="#warehouse">Warehouse</a>
          <a href="#delivery">Shipments <span>12</span></a>
          <a href="#">Exceptions <span className="danger">2</span></a>
          <p className="asideLabel second">Workforce</p>
          <a href="#shifts">Shifts</a>
          <a href="#">Training & safety</a>
          <div className="facility"><small>Active facility</small><strong>Istanbul · IST-01</strong><span>08:42 TRT · Shift A</span></div>
        </aside>

        <div className="content">
          <div className="pageTitle"><div><p className="eyebrow">Saturday, 22 August</p><h1>Operations control tower</h1><p>What needs attention across receiving, consolidation, and delivery.</p></div><div className="scope"><span>Network view</span><strong>Turkey + Italy → USA</strong></div></div>

          <section className="signalGrid" aria-label="Operational signals">
            {signals.map((signal) => <article key={signal.label}><span>{signal.label}</span><strong>{signal.value}</strong><div><b>{signal.change}</b><small>{signal.hint}</small></div></article>)}
          </section>

          <div className="alert"><div className="alertIcon">!</div><div><strong>Two blockers can affect the next consolidation cutoff.</strong><p>Como ASN-486 is missing a packing list. One repack task must finish before 16:40 TRT.</p></div><button className="secondary">Review blockers</button></div>

          <div id="planner"><PlanningWorkbench initialPlan={plan} /></div>

          <div className="twoCol">
            <section className="panel" id="receiving"><div className="panelHeader"><div><p className="eyebrow">Receiving</p><h2>Inbound appointments</h2></div><a href="#">View schedule</a></div><div className="table">{inbounds.map((item) => <div className="row" key={item.ref}><div><strong>{item.ref}</strong><span>{item.origin}</span></div><div><strong>{item.eta}</strong><span>{item.units}</span></div><span className={`pill ${item.tone}`}>{item.state}</span></div>)}</div></section>
            <section className="panel" id="warehouse"><div className="panelHeader"><div><p className="eyebrow">Warehouse</p><h2>Work queue</h2></div><a href="#">All work</a></div><div className="table">{work.map((item) => <div className="row workRow" key={item.task}><div><strong>{item.task}</strong><span>{item.zone}</span></div><div><strong>{item.owner}</strong><span>Due {item.due}</span></div><span className={`pill ${item.priority === "Urgent" ? "warn" : "neutral"}`}>{item.priority}</span></div>)}</div></section>
          </div>

          <section className="panel shiftPanel" id="shifts"><div><p className="eyebrow">Shift coverage</p><h2>Today’s warehouse capacity</h2><p className="muted">Manual staffing remains authoritative until workforce scheduling is connected.</p></div><div className="shiftNumbers"><div><strong>18 / 20</strong><span>Shift A staffed</span></div><div><strong>12 / 14</strong><span>Shift B staffed</span></div><div><strong>7.5 hrs</strong><span>Open work</span></div></div><button className="secondary">Open shift board</button></section>
        </div>
      </div>
    </main>
  );
}

