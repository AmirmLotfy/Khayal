const escapeText = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function exportPlaybill(names: string[], channel: string) {
  await document.fonts.ready;
  const pages = Math.max(1, Math.ceil(names.length / 48));
  for (let page = 0; page < pages; page++) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#EEE5D3";
    c.fillRect(0, 0, 1080, 1350);
    c.strokeStyle = "#9C2E1F";
    c.lineWidth = 3;
    c.strokeRect(45, 45, 990, 1260);
    c.fillStyle = "#9C2E1F";
    c.textAlign = "center";
    c.font = "88px Georgia";
    c.fillText("خيال · KHAYAL", 540, 170);
    c.font = "24px sans-serif";
    c.fillText("THE NIGHT’S COMPANY", 540, 230);
    c.fillStyle = "#17110D";
    c.font = "20px sans-serif";
    c.fillText(
      channel +
        " · " +
        new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" }),
      540,
      280,
    );
    c.textAlign = "start";
    c.font = "25px sans-serif";
    names.slice(page * 48, (page + 1) * 48).forEach((name, i) => {
      const rtl = /[\u0600-\u06ff]/.test(name);
      c.direction = rtl ? "rtl" : "ltr";
      c.textAlign = rtl ? "right" : "left";
      const x = 85 + (i % 2) * 485;
      c.fillText(name, rtl ? x + 420 : x, 360 + Math.floor(i / 2) * 31, 420);
    });
    c.direction = "ltr";
    c.textAlign = "center";
    c.font = "italic 27px Georgia";
    c.fillText("Come back tomorrow. There is more to see.", 540, 1190);
    c.font = "18px sans-serif";
    c.fillText(
      `${names.length} cast members · Playbill ${page + 1} of ${pages}`,
      540,
      1250,
    );
    const blob = await new Promise<Blob>((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    const a = document.createElement("a");
    a.download = `khayal-playbill-${page + 1}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
export { escapeText };
