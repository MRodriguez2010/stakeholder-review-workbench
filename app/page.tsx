"use client";

import { useState } from "react";
import { ReviewLayer } from "./review-layer";
import "./sample.css";

const content = {
  es: {
    welcome: "Bienvenidos a", title: "Casa del Patio", label: "Centro cultural · Sitio de muestra",
    intro: "Un lugar para leer, crear y aprender en compañía.",
    program: "Esta semana", visit: "Planifica tu visita", day: "Sábado",
    event: "Taller de impresión", detail: "Una mesa abierta para explorar papel, tinta y color.",
    hours: "La galería abre de 10 a 16 h. La entrada es libre.",
  },
  en: {
    welcome: "Welcome to", title: "Casa del Patio", label: "Arts center · Sample website",
    intro: "A space to read, make things and learn together.",
    program: "This week", visit: "Plan your visit", day: "Saturday",
    event: "Printmaking workshop", detail: "An open table for exploring paper, ink and color.",
    hours: "The gallery opens from 10 am to 4 pm. Admission is free.",
  },
};

export default function Page() {
  const [language, setLanguage] = useState<"es" | "en">("es");
  const c = content[language];
  return <>
    <main className="patio">
      <header><strong>Casa del Patio</strong><button onClick={() => setLanguage(language === "es" ? "en" : "es")}>{language === "es" ? "English" : "Español"}</button></header>
      <section className="patio-hero hero" data-review-section="hero" data-review-label="Welcome">
        <div><p>{c.label}</p><h1>{c.welcome}<br/>{c.title}</h1><p>{c.intro}</p></div>
        <div className="patio-print" aria-hidden="true"><i/><b/><span/></div>
      </section>
      <section className="patio-program" data-review-section="program" data-review-label="Program">
        <p>{c.program}</p><h2>{c.event}</h2><p>{c.day} · 11:00</p><p>{c.detail}</p>
      </section>
      <section className="patio-visit" data-review-section="visit" data-review-label="Visitor information">
        <h2>{c.visit}</h2><p>{c.hours}</p>
      </section>
    </main>
    <ReviewLayer/>
  </>;
}
