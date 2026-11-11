"use client";

/** The describe-your-event fields shared by "Host an event" and "Edit details". */
export interface DetailsDraft {
  hostName: string;
  description: string;
  coverUrl: string;
  agenda: string;
}

export const EMPTY_DETAILS: DetailsDraft = { hostName: "", description: "", coverUrl: "", agenda: "" };

export function DetailsFields({ value, onChange }: { value: DetailsDraft; onChange: (v: DetailsDraft) => void }) {
  const set = (k: keyof DetailsDraft) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const coverOk = !value.coverUrl.trim() || value.coverUrl.trim().startsWith("https://");
  return (
    <>
      <label className="field">Hosted by (your name or community)<input value={value.hostName} onChange={set("hostName")} maxLength={120} placeholder="Lagos Builders" /></label>
      <label className="field">
        What happens
        <textarea rows={5} value={value.description} onChange={set("description")} maxLength={2000} placeholder="Who it's for, what they'll get, food, what to bring." />
      </label>
      <label className="field">
        Programme, one line each (optional)
        <textarea rows={4} value={value.agenda} onChange={set("agenda")} placeholder={"18:00 Doors open\n18:30 Demos\n20:00 Food"} className="mono" style={{ fontSize: 15 }} />
      </label>
      <label className="field">
        Cover photo link (optional)
        <input value={value.coverUrl} onChange={set("coverUrl")} placeholder="https://… a photo from a past edition works best" inputMode="url" />
        <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
          {coverOk ? "Without one, the event gets a poster made from its title and date." : "The link must start with https://"}
        </span>
      </label>
      {value.coverUrl.trim().startsWith("https://") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value.coverUrl.trim()} alt="Cover preview" style={{ width: "100%", maxHeight: 220, objectFit: "cover", border: "2px solid #111", borderRadius: 12 }} />
      )}
    </>
  );
}
