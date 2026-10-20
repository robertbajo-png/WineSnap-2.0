export type LocalTimer = {
  id: string;
  name: string;
  durationMs: number;
  deadline: number | null;
  pausedMs: number;
};

export function remainingMs(timer: LocalTimer, now: number) {
  return Math.max(0, timer.deadline === null ? timer.pausedMs : timer.deadline - now);
}

export function timerText(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function createTimer(id: string, name: string, minutes: number, now: number): LocalTimer {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180)
    throw new Error("Invalid duration");
  const durationMs = minutes * 60_000;
  return {
    id,
    name: name.trim().slice(0, 50) || "Timer",
    durationMs,
    deadline: now + durationMs,
    pausedMs: durationMs,
  };
}

export function toggleTimer(timer: LocalTimer, now: number): LocalTimer {
  return timer.deadline === null
    ? { ...timer, deadline: now + timer.pausedMs }
    : { ...timer, pausedMs: remainingMs(timer, now), deadline: null };
}

export function scaleAmount(amount: number, servings: number) {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isInteger(servings) ||
    servings < 1 ||
    servings > 8
  )
    throw new Error("Invalid amount");
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(
    (amount * servings) / 2,
  );
}

export function sampleAnswer(question: string, recipe: string, cooking: boolean) {
  if (/allerg|säker|temperatur|sjuk/i.test(question))
    return "Det här är ett förskrivet AI-exempel, inte en säkerhetsbedömning. Kontrollera ingrediensernas märkning och använd ett verifierat recept för allergier och säker tillagning.";
  if (/vin|dryck/i.test(question))
    return `Till ${recipe.toLocaleLowerCase("sv-SE")} skulle ett friskt vitt vin kunna vara ett smakmässigt alternativ. Detta är ett exempel; din riktiga vinkällare är inte ansluten. Ett glas vatten med citron fungerar också fint.`;
  if (/byt|ersätt|istället|i stället/i.test(question))
    return "I det här receptexemplet kan du prova en annan kokt vit böna i krämen. Justera vätskan lite i taget och smaka av. Bytet är ett förslag och ändrar inte ingredienslistan automatiskt.";
  if (/minne|gill|smak/i.test(question))
    return "Exempelminnet visar extra citron och vegetariska vardagsrätter. Det är inte slutsatser om dig. I Min matprofil kan du bekräfta, redigera eller ta bort exemplen.";
  return cooking
    ? `För ${recipe.toLocaleLowerCase("sv-SE")}: förbered nästa ingrediens medan du väntar och kontrollera tillagningen under tiden. Timern är ett hjälpmedel, inte ett mått på när maten är färdig. Det här svaret är ett förskrivet exempel.`
    : "Ett exempel till ikväll: rostad blomkål med len bönkräm och citron. Du kan öppna receptet, ändra portioner och prova matlagningsvyn. Svaret är förskrivet; ingen AI-tjänst är ansluten.";
}
