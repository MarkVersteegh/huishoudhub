export const dutchDays = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
export const dutchMonths = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

// Gebruik lokale kalenderdatums, zodat taken niet door UTC-conversie een dag verschuiven.
export function todayStr(now) {
  return (now || new Date()).toLocaleDateString("en-CA");
}

export function weekEndStr(now) {
  const d = now ? new Date(now) : new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toLocaleDateString("en-CA");
}

export function dateToDay(dateStr) {
  return dutchDays[new Date(dateStr + "T00:00:00").getDay()];
}

export function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const name = dutchDays[d.getDay()];
  return name.charAt(0).toUpperCase() + name.slice(1) + " " + d.getDate() + " " + dutchMonths[d.getMonth()];
}

export function computeBucket(task, now) {
  const ref = now || new Date();
  const today = todayStr(ref);
  if (task.date < today) return "overdue";
  if (task.date > today) return task.date <= weekEndStr(ref) ? "soon" : "future";
  const hour = ref.getHours();
  if (task.time === "ochtend" && hour < 12) return "now";
  if (task.time === "middag" && hour >= 12 && hour < 18) return "now";
  if (task.time === "avond" && hour >= 18) return "now";
  return "today";
}

// Tekst voor taken die vóór vandaag gepland stonden.
export function computeLate(date, now) {
  const diff = Math.round((new Date(todayStr(now) + "T00:00:00") - new Date(date + "T00:00:00")) / 86400000);
  if (diff <= 0) return "";
  return diff === 1 ? "1 dag te laat" : diff + " dagen te laat";
}

// De zichtbare "wanneer"-tekst is eerst de gezinsnotitie, daarna datumcontext.
export function computeDue(date, note, now) {
  if (note) return note;
  if (date === todayStr(now)) return "vandaag";
  return dateToDay(date);
}

// Vertaal opgeslagen repeat-rule JSON naar compacte Nederlandse UI-labels.
export function repeatLabel(rule) {
  if (!rule) return "";
  switch (rule.type) {
    case "once":     return "";
    case "daily":    return rule.interval === 1 ? "dagelijks" : "om de " + rule.interval + " dagen";
    case "weekdays": return "schooldagen";
    case "weekly":   return rule.days ? "wekelijks" : "wekelijks";
    case "monthly":  return "maandelijks";
    default:         return rule.type;
  }
}

// Nieuwe herhalingsseries krijgen voorlopig een horizon van één maand.
export function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString("en-CA");
}

// Weekweergave loopt bewust van maandag t/m zondag, ook als vandaag zondag is.
export function weekRange(now) {
  const today = now ? new Date(now) : new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const start = new Date(today);
  const end = new Date(today);
  start.setDate(today.getDate() + mondayOffset);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toLocaleDateString("en-CA"),
    end: end.toLocaleDateString("en-CA"),
  };
}

// Koppelt elke weekdag aan het bestaande DOM-target in de weekview.
export function getWeekDates(now) {
  const today = now ? new Date(now) : new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return [
    { name: "maandag", targetId: "weekMondayTasks", labelId: "weekMondayLabel" },
    { name: "dinsdag", targetId: "weekTuesdayTasks", labelId: "weekTuesdayLabel" },
    { name: "woensdag", targetId: "weekWednesdayTasks", labelId: "weekWednesdayLabel" },
    { name: "donderdag", targetId: "weekThursdayTasks", labelId: "weekThursdayLabel" },
    { name: "vrijdag", targetId: "weekFridayTasks", labelId: "weekFridayLabel" },
    { name: "zaterdag", targetId: "weekSaturdayTasks", labelId: "weekSaturdayLabel" },
    { name: "zondag", targetId: "weekSundayTasks", labelId: "weekSundayLabel" },
  ].map(function(g, i) {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i);
    return { name: g.name, targetId: g.targetId, labelId: g.labelId, date: d.toLocaleDateString("en-CA") };
  });
}
