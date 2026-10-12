/* Reine Logik der Zeiterfassung (ohne Oberfläche). Wird von index.html und test.html geladen.
   Dauer, CSV-Format und Stundenzettel entsprechen erzeuge_stundenzettel.py. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Zeit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SPALTEN = ["datum", "beginn", "pause_min", "ende", "kuerzel", "bemerkung", "aufgezeichnet_am"];
  const KUERZEL = [
    ["K", "Krank"],
    ["U", "Urlaub"],
    ["UU", "unbezahlter Urlaub"],
    ["F", "Feiertag"],
    ["SA", "Stundenweise abwesend"],
    ["SU", "Stundenweise Urlaub"],
  ];
  const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const FRIST_TAGE = 7; // Aufzeichnung spätestens bis zum Ablauf des 7. Folgetags

  const pad = (n) => (n < 10 ? "0" : "") + n;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  }

  function heuteIso(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function jetztHhmm(d) {
    d = d || new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function istDatum(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  function utc(iso) {
    const p = iso.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function addTage(iso, n) {
    const d = new Date(utc(iso) + n * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function tageZwischen(vonIso, bisIso) {
    return Math.round((utc(bisIso) - utc(vonIso)) / 86400000);
  }

  function wochentag(iso) { // 0 = Montag
    return (new Date(utc(iso)).getUTCDay() + 6) % 7;
  }

  function tageImMonat(jahr, monat) {
    return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  }

  /** "" bei leerer Eingabe, null bei ungültiger, sonst "HH:MM". */
  function normZeit(s) {
    s = (s || "").trim();
    if (!s) return "";
    const m = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(s);
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return pad(+m[1]) + ":" + m[2];
  }

  function minuten(z) {
    const p = z.split(":");
    return +p[0] * 60 + +p[1];
  }

  /** Dauer = Ende - Beginn - Pause; Ende vor Beginn heißt: über Mitternacht. */
  function dauerMin(e) {
    if (!e.beginn || !e.ende) return 0;
    let diff = minuten(e.ende) - minuten(e.beginn);
    if (diff < 0) diff += 24 * 60;
    const pause = parseInt(e.pause_min || "0", 10) || 0;
    return Math.max(diff - pause, 0);
  }

  function hhmm(gesamt) {
    return Math.floor(gesamt / 60) + ":" + pad(gesamt % 60);
  }

  function datumDe(iso) {
    const p = iso.split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }

  function verspaetet(e) {
    if (!e.aufgezeichnet_am || !istDatum(e.aufgezeichnet_am) || !istDatum(e.datum)) return false;
    return e.aufgezeichnet_am > addTage(e.datum, FRIST_TAGE);
  }

  function sortiere(liste) {
    return liste.slice().sort((a, b) =>
      a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0);
  }

  function imMonat(liste, jahr, monat) {
    const praefix = jahr + "-" + pad(monat) + "-";
    return sortiere(liste.filter((e) => e.datum.indexOf(praefix) === 0));
  }

  function schluessel(e) {
    return [e.datum, e.beginn, e.pause_min || "0", e.ende, e.kuerzel, e.bemerkung].join("|");
  }

  /** Fügt neue Einträge hinzu, Doppelte (gleiche Angaben) werden ignoriert. */
  function zusammenfuehren(bestand, neu) {
    const vorhanden = new Set(bestand.map(schluessel));
    const ergebnis = bestand.slice();
    let hinzu = 0;
    neu.forEach((e) => {
      const k = schluessel(e);
      if (vorhanden.has(k)) return;
      vorhanden.add(k);
      ergebnis.push(e);
      hinzu++;
    });
    return { liste: ergebnis, hinzugefuegt: hinzu, doppelt: neu.length - hinzu };
  }

  // ---------- CSV ----------

  function csvZeilen(text, trenner) {
    const zeilen = [];
    let zeile = [], feld = "", inAnf = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inAnf) {
        if (c === '"') {
          if (text[i + 1] === '"') { feld += '"'; i++; } else inAnf = false;
        } else feld += c;
      } else if (c === '"') inAnf = true;
      else if (c === trenner) { zeile.push(feld); feld = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        zeile.push(feld); feld = "";
        zeilen.push(zeile); zeile = [];
      } else feld += c;
    }
    if (feld !== "" || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
    return zeilen;
  }

  /** Liest eine CSV (Trenner ; oder ,). Liefert {eintraege, fehler:[Text]}. */
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, "");
    const erste = text.split(/\r?\n/)[0] || "";
    const trenner = erste.split(";").length >= erste.split(",").length ? ";" : ",";
    const zeilen = csvZeilen(text, trenner).filter((z) => z.some((f) => f.trim() !== ""));
    const fehler = [];
    if (!zeilen.length) return { eintraege: [], fehler: ["Die Datei ist leer."] };
    const kopf = zeilen[0].map((s) => s.trim().toLowerCase());
    if (kopf.indexOf("datum") < 0) return { eintraege: [], fehler: ["Die Spalte „datum“ fehlt – das ist keine Zeiterfassungs-Datei."] };
    const eintraege = [];
    zeilen.slice(1).forEach((z, i) => {
      const roh = {};
      kopf.forEach((name, j) => { roh[name] = (z[j] || "").trim(); });
      const nr = i + 2;
      if (!istDatum(roh.datum)) { fehler.push("Zeile " + nr + ": Datum „" + roh.datum + "“ ungültig, übersprungen"); return; }
      const beginn = normZeit(roh.beginn), ende = normZeit(roh.ende);
      if (beginn === null || ende === null) { fehler.push("Zeile " + nr + ": Uhrzeit ungültig, übersprungen"); return; }
      const kuerzel = (roh.kuerzel || "").toUpperCase();
      eintraege.push({
        id: neueId(),
        datum: roh.datum, beginn: beginn, pause_min: roh.pause_min || "0", ende: ende,
        kuerzel: kuerzel, bemerkung: roh.bemerkung || "",
        aufgezeichnet_am: istDatum(roh.aufgezeichnet_am) ? roh.aufgezeichnet_am : "",
      });
    });
    return { eintraege: eintraege, fehler: fehler };
  }

  function csvFeld(s) {
    s = String(s == null ? "" : s);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(liste) {
    const zeilen = [SPALTEN.join(";")];
    sortiere(liste).forEach((e) => zeilen.push(SPALTEN.map((k) => csvFeld(e[k])).join(";")));
    return zeilen.join("\n") + "\n";
  }

  function neueId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Stundenzettel ----------

  /** Zeilen des Stundenzettels als Rohwerte: [{we, zellen:[tag, beginn, pause, ende, dauer, kuerzel, aufgezeichnet, bemerkung]}]. */
  function zeilenDaten(eintraege, jahr, monat) {
    const nachTag = {};
    eintraege.forEach((e) => { (nachTag[e.datum] = nachTag[e.datum] || []).push(e); });
    const zeilen = [];
    for (let nr = 1; nr <= tageImMonat(jahr, monat); nr++) {
      const iso = jahr + "-" + pad(monat) + "-" + pad(nr);
      const wd = wochentag(iso);
      const tagText = WOCHENTAGE[wd] + " " + nr + ".";
      const we = wd >= 5;
      const tagesEintraege = nachTag[iso] && nachTag[iso].length ? nachTag[iso] : [null];
      tagesEintraege.forEach((e, i) => {
        if (e === null) {
          zeilen.push({ we: we, leer: true, zellen: [tagText, "", "", "", "", "", "", ""] });
          return;
        }
        const pause = e.pause_min && e.pause_min !== "0" ? e.pause_min + " min" : "";
        const dauer = e.beginn && e.ende ? hhmm(dauerMin(e)) : "";
        let aufgezeichnet = e.aufgezeichnet_am ? (istDatum(e.aufgezeichnet_am) ? datumDe(e.aufgezeichnet_am) : e.aufgezeichnet_am) : "";
        if (verspaetet(e)) aufgezeichnet += " (!)";
        zeilen.push({ we: we, zellen: [i === 0 ? tagText : "", e.beginn, pause, e.ende, dauer, e.kuerzel, aufgezeichnet, e.bemerkung] });
      });
    }
    return zeilen;
  }

  function zeilenHtml(eintraege, jahr, monat) {
    return zeilenDaten(eintraege, jahr, monat).map((z) => {
      const z8 = z.zellen.map(esc);
      if (z.leer) return "<tr" + (z.we ? ' class="we"' : "") + "><td>" + z8[0] + "</td>" + "<td></td>".repeat(7) + "</tr>";
      return "<tr" + (z.we ? ' class="we"' : "") + "><td>" + z8[0] + "</td><td>" + z8[1] + "</td><td>" + z8[2] +
        "</td><td>" + z8[3] + '</td><td class="r">' + z8[4] + '</td><td class="c">' + z8[5] +
        "</td><td>" + z8[6] + "</td><td>" + z8[7] + "</td></tr>";
    }).join("\n");
  }

  const ZETTEL_CSS = `
.zettel { font-family: Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; padding: 12px; min-width: 640px; }
.zettel h1 { font-size: 14pt; margin: 0 0 8px; }
.zettel table { border-collapse: collapse; width: 100%; }
.zettel th, .zettel td { border: 1px solid #444; padding: 2px 4px; }
.zettel th { background: #e8e8e8; font-size: 9pt; }
.zettel .kopf td { border: none; padding: 2px 0; }
.zettel .r { text-align: right; } .zettel .c { text-align: center; }
.zettel .we td { background: #f4f4f4; }
.zettel .summe td { font-weight: bold; border-top: 2px solid #000; }
.zettel .unterschrift { margin-top: 28px; }
.zettel .unterschrift td { border: none; border-top: 1px solid #000; padding-top: 2px; font-size: 9pt; width: 22%; }
.zettel .unterschrift td.leer { border-top: none; width: 4%; }
.zettel .legende { width: auto; margin-top: 14px; font-size: 9pt; }
.zettel .warn { font-size: 9pt; }
@media print {
  .zettel { min-width: 0; padding: 0; font-size: 9pt; }
  .zettel h1 { font-size: 13pt; margin-bottom: 4px; }
  .zettel th, .zettel td { padding: 0 4px; line-height: 1.2; }
  .zettel .kopf td { padding: 1px 0; }
  .zettel .unterschrift { margin-top: 18px; }
  .zettel .legende { margin-top: 8px; }
  .zettel .legende td { padding: 0 6px; }
}
`;

  function zettelHtml(kopf, eintraege, jahr, monat) {
    const summe = eintraege.reduce((s, e) => s + dauerMin(e), 0);
    const legende = KUERZEL.map((k) => '<tr><td class="c"><b>' + k[0] + "</b></td><td>" + k[1] + "</td></tr>").join("");
    const warnung = eintraege.some(verspaetet)
      ? '<p class="warn">(!) = später als ' + FRIST_TAGE + " Tage nach dem Arbeitstag aufgezeichnet.</p>" : "";
    return '<div class="zettel">\n<h1>Dokumentation der täglichen Arbeitszeit</h1>\n<table class="kopf">\n' +
      '<tr><td style="width:30%">Firma:</td><td>' + esc(kopf.firma) + "</td></tr>\n" +
      "<tr><td>Name des Mitarbeiters:</td><td>" + esc(kopf.name) + "</td></tr>\n" +
      "<tr><td>Pers.-Nr.:</td><td>" + esc(kopf.pers_nr || "") + "</td><td>Monat/Jahr: " + pad(monat) + "/" + jahr + "</td></tr>\n</table>\n<br>\n<table>\n" +
      "<tr><th>Kalendertag</th><th>Beginn<br>(Uhrzeit)</th><th>Pause<br>(Dauer)</th><th>Ende<br>(Uhrzeit)</th>\n" +
      "<th>Dauer<br>(Summe)</th><th>*</th><th>aufgezeichnet<br>am</th><th>Bemerkungen</th></tr>\n" +
      zeilenHtml(eintraege, jahr, monat) + "\n" +
      '<tr class="summe"><td colspan="4" class="r">Summe:</td><td class="r">' + hhmm(summe) + '</td><td colspan="3"></td></tr>\n</table>\n' +
      warnung + "\n" +
      '<table class="unterschrift"><tr>\n<td>Datum</td><td class="leer"></td><td>Unterschrift des Arbeitnehmers</td><td class="leer"></td>\n' +
      '<td>Datum</td><td class="leer"></td><td>Unterschrift des Arbeitgebers</td></tr></table>\n' +
      '<p class="warn">* Kürzel für diesen Kalendertag, falls zutreffend:</p>\n<table class="legende">' + legende + "</table>\n</div>";
  }

  return {
    SPALTEN, KUERZEL, WOCHENTAGE, FRIST_TAGE, ZETTEL_CSS,
    esc, pad, heuteIso, jetztHhmm, istDatum, addTage, tageZwischen, wochentag, tageImMonat,
    normZeit, minuten, dauerMin, hhmm, datumDe, verspaetet, sortiere, imMonat,
    zusammenfuehren, parseCsv, toCsv, neueId, zeilenDaten, zeilenHtml, zettelHtml,
  };
});
