// DOM-free entity page and graph trace views. These return plain objects the DOM layer renders, so the
// link-resolution logic is testable without a browser. Every id in the input must already be a resolved row.

export function entityPageView(data) {
  if (!data?.found) return { title: "Entity not found", aliases: [], facts: [], memories: [] };
  return {
    title: data.entity?.name ?? "",
    canonicalName: data.entity?.canonical_name ?? "",
    type: data.entity?.type ?? "",
    aliases: (data.aliases ?? []).map((alias) => alias.alias),
    facts: (data.facts ?? []).map((fact) => ({ id: fact.id, text: fact.text, status: fact.status })),
    memories: (data.memories ?? []).map((memory) => ({ id: memory.id, title: memory.title, project: memory.project })),
  };
}

export function graphTraceView(trace) {
  return (trace ?? []).map((line) => ({ text: line }));
}
