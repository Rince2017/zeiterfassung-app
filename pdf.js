/* Erzeugt den Stundenzettel als echtes PDF (DIN A4 hoch, Standardschrift Helvetica, ohne Fremdbibliothek).
   Aufruf: ZeitPdf.erzeuge(Zeit, kopf, eintraege, jahr, monat) -> Uint8Array
   Die Zellwerte kommen aus Zeit.zeilenDaten und sind damit identisch zur Bildschirmansicht. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ZeitPdf = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SEITE_B = 595.28, SEITE_H = 841.89, RAND = 34;

  // Helvetica-Zeichenbreiten (1/1000 em) für ASCII 32–126
  const BREITEN = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ];
  const BREITE_SONDER = { "ä": 556, "ö": 556, "ü": 556, "ß": 611, "Ä": 667, "Ö": 778, "Ü": 722, "–": 556, "—": 1000, "„": 333, "“": 333, "”": 333, "…": 1000 };
  const WINANSI = { "–": 0x96, "—": 0x97, "„": 0x84, "“": 0x93, "”": 0x94, "‚": 0x82, "‘": 0x91, "’": 0x92, "…": 0x85, "€": 0x80, "•": 0x95 };

  function zeichenBreite(c) {
    const code = c.charCodeAt(0);
    if (code >= 32 && code <= 126) return BREITEN[code - 32];
    return BREITE_SONDER[c] || 556;
  }

  /** Textbreite in Punkt; Fettschrift wird mit einem Zuschlag geschätzt. */
  function textBreite(s, groesse, fett) {
    let b = 0;
    for (const c of s) b += zeichenBreite(c);
    return (b / 1000) * groesse * (fett ? 1.07 : 1);
  }

  /** Unicode -> WinAnsi (ein Byte je Zeichen), Klammern und Backslash maskiert. */
  function kodiere(s) {
    let aus = "";
    for (const c of s) {
      const code = c.charCodeAt(0);
      let b;
      if (WINANSI[c]) b = WINANSI[c];
      else if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) b = code;
      else b = 63; // ?
      const z = String.fromCharCode(b);
      aus += z === "\\" || z === "(" || z === ")" ? "\\" + z : z;
    }
    return aus;
  }

  function kuerze(s, breite, groesse, fett) {
    if (textBreite(s, groesse, fett) <= breite) return s;
    while (s.length > 1 && textBreite(s + "…", groesse, fett) > breite) s = s.slice(0, -1);
    return s + "…";
  }

  const zahl = (n) => n.toFixed(2);

  function seitenInhalt() {
    const teile = [];
    return {
      teile: teile,
      /** y in Punkt von oben; (x, y) ist die Grundlinie. */
      text(x, y, s, groesse, fett, ausrichtung, breite) {
        if (!s) return;
        const w = textBreite(s, groesse, fett);
        let px = x;
        if (ausrichtung === "r") px = x + breite - w;
        else if (ausrichtung === "c") px = x + (breite - w) / 2;
        teile.push("BT /" + (fett ? "F2" : "F1") + " " + zahl(groesse) + " Tf " + zahl(px) + " " + zahl(SEITE_H - y) + " Td (" + kodiere(s) + ") Tj ET");
      },
      rechteck(x, y, b, h, fuellung) {
        if (fuellung !== undefined) teile.push(zahl(fuellung) + " g " + zahl(x) + " " + zahl(SEITE_H - y - h) + " " + zahl(b) + " " + zahl(h) + " re f 0 g");
        teile.push(zahl(x) + " " + zahl(SEITE_H - y - h) + " " + zahl(b) + " " + zahl(h) + " re S");
      },
      linie(x1, y1, x2, y2, staerke) {
        teile.push(zahl(staerke || 0.5) + " w " + zahl(x1) + " " + zahl(SEITE_H - y1) + " m " + zahl(x2) + " " + zahl(SEITE_H - y2) + " l S 0.5 w");
      },
    };
  }

  function erzeuge(Z, kopf, eintraege, jahr, monat) {
    const breite = SEITE_B - 2 * RAND;
    const spalten = [62, 50, 50, 50, 52, 30, 78];
    spalten.push(breite - spalten.reduce((a, b) => a + b, 0));
    const spaltenX = [RAND];
    spalten.forEach((b, i) => spaltenX.push(spaltenX[i] + b));

    const ZEILE = 15, KOPFZEILE = 24, SCHRIFT = 9;
    const zeilen = Z.zeilenDaten(eintraege, jahr, monat);
    const summe = eintraege.reduce((s, e) => s + Z.dauerMin(e), 0);
    const hatVerspaetet = eintraege.some(Z.verspaetet);

    const seiten = [];
    let seite, y;

    function neueSeite() {
      seite = seitenInhalt();
      seite.teile.push("0.5 w 0.27 G 0 g");
      seiten.push(seite);
      y = RAND;
    }

    function tabellenKopf() {
      const titel = [["Kalendertag"], ["Beginn", "(Uhrzeit)"], ["Pause", "(Dauer)"], ["Ende", "(Uhrzeit)"], ["Dauer", "(Summe)"], ["*"], ["aufgezeichnet", "am"], ["Bemerkungen"]];
      titel.forEach((t, i) => {
        seite.rechteck(spaltenX[i], y, spalten[i], KOPFZEILE, 0.91);
        if (t.length === 1) seite.text(spaltenX[i], y + KOPFZEILE / 2 + 2.8, t[0], 8, true, "c", spalten[i]);
        else {
          seite.text(spaltenX[i], y + 10, t[0], 8, true, "c", spalten[i]);
          seite.text(spaltenX[i], y + 20, t[1], 8, true, "c", spalten[i]);
        }
      });
      y += KOPFZEILE;
    }

    function kopfBlock() {
      seite.text(RAND, y + 12, "Dokumentation der täglichen Arbeitszeit", 14, true);
      y += 28;
      const zeilenKopf = [["Firma:", kopf.firma || ""], ["Name des Mitarbeiters:", kopf.name || ""], ["Pers.-Nr.:", String(kopf.pers_nr || "")]];
      zeilenKopf.forEach((z, i) => {
        seite.text(RAND, y + 9, z[0], 9, false);
        seite.text(RAND + breite * 0.3, y + 9, kuerze(z[1], breite * (i === 2 ? 0.25 : 0.68), 9, false), 9, false);
        if (i === 2) seite.text(RAND + breite * 0.6, y + 9, "Monat/Jahr: " + Z.pad(monat) + "/" + jahr, 9, false);
        y += 13;
      });
      y += 10;
    }

    function zelle(i, text, ausrichtung, fett, fuellung) {
      seite.rechteck(spaltenX[i], y, spalten[i], ZEILE, fuellung);
      if (!text) return;
      const innen = spalten[i] - 6;
      const s = kuerze(text, innen, SCHRIFT, fett);
      seite.text(spaltenX[i] + 3, y + ZEILE / 2 + 3.1, s, SCHRIFT, fett, ausrichtung, innen);
    }

    neueSeite();
    kopfBlock();
    tabellenKopf();

    zeilen.forEach((z) => {
      if (y + ZEILE > SEITE_H - RAND) { neueSeite(); tabellenKopf(); }
      const f = z.we ? 0.957 : undefined;
      const ausr = ["l", "l", "l", "l", "r", "c", "l", "l"];
      z.zellen.forEach((t, i) => zelle(i, t, ausr[i], false, f));
      y += ZEILE;
    });

    // Summenzeile
    if (y + ZEILE > SEITE_H - RAND) { neueSeite(); tabellenKopf(); }
    seite.rechteck(spaltenX[0], y, spaltenX[4] - spaltenX[0], ZEILE);
    seite.text(spaltenX[0] + 3, y + ZEILE / 2 + 3.1, "Summe:", SCHRIFT, true, "r", spaltenX[4] - spaltenX[0] - 6);
    seite.rechteck(spaltenX[4], y, spalten[4], ZEILE);
    seite.text(spaltenX[4] + 3, y + ZEILE / 2 + 3.1, Z.hhmm(summe), SCHRIFT, true, "r", spalten[4] - 6);
    seite.rechteck(spaltenX[5], y, spaltenX[8] - spaltenX[5], ZEILE);
    seite.linie(spaltenX[0], y, spaltenX[8], y, 1.5);
    y += ZEILE;

    // Fußbereich (Hinweis, Unterschriften, Legende)
    const legendeZeile = 12.5;
    const fussHoehe = (hatVerspaetet ? 16 : 0) + 52 + 20 + Z.KUERZEL.length * legendeZeile;
    if (y + fussHoehe > SEITE_H - RAND) neueSeite();

    if (hatVerspaetet) {
      seite.text(RAND, y + 14, "(!) = später als " + Z.FRIST_TAGE + " Tage nach dem Arbeitstag aufgezeichnet.", 8, false);
      y += 16;
    }
    y += 34;
    const seg = breite * 0.22, luecke = breite * 0.04;
    ["Datum", "Unterschrift des Arbeitnehmers", "Datum", "Unterschrift des Arbeitgebers"].forEach((t, i) => {
      const x = RAND + i * (seg + luecke);
      seite.linie(x, y, x + seg, y, 0.6);
      let g = 8;
      while (g > 6 && textBreite(t, g, false) > seg) g -= 0.5;
      seite.text(x, y + 10, t, g, false);
    });
    y += 28;

    seite.text(RAND, y + 8, "* Kürzel für diesen Kalendertag, falls zutreffend:", 8, false);
    y += 14;
    Z.KUERZEL.forEach((k) => {
      seite.rechteck(RAND, y, 28, legendeZeile);
      seite.rechteck(RAND + 28, y, 130, legendeZeile);
      seite.text(RAND, y + 9, k[0], 8, true, "c", 28);
      seite.text(RAND + 31, y + 9, k[1], 8, false);
      y += legendeZeile;
    });

    return baueDatei(seiten);
  }

  function baueDatei(seiten) {
    const objekte = []; // Index = Objektnummer - 1
    objekte[0] = "<< /Type /Catalog /Pages 2 0 R >>";
    const kinder = seiten.map((_, i) => (6 + 2 * i) + " 0 R").join(" ");
    objekte[1] = "<< /Type /Pages /Kids [" + kinder + "] /Count " + seiten.length + " >>";
    objekte[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objekte[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    seiten.forEach((s, i) => {
      const inhalt = s.teile.join("\n");
      objekte[4 + 2 * i] = "<< /Length " + inhalt.length + " >>\nstream\n" + inhalt + "\nendstream";
      objekte[5 + 2 * i] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + SEITE_B + " " + SEITE_H + "] " +
        "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (5 + 2 * i) + " 0 R >>";
    });
    let datei = "%PDF-1.4\n";
    const offsets = [];
    objekte.forEach((o, i) => {
      offsets.push(datei.length);
      datei += (i + 1) + " 0 obj\n" + o + "\nendobj\n";
    });
    const xref = datei.length;
    datei += "xref\n0 " + (objekte.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach((o) => { datei += String(o).padStart(10, "0") + " 00000 n \n"; });
    datei += "trailer\n<< /Size " + (objekte.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    const bytes = new Uint8Array(datei.length);
    for (let i = 0; i < datei.length; i++) bytes[i] = datei.charCodeAt(i) & 255;
    return bytes;
  }

  return { erzeuge, textBreite };
});
