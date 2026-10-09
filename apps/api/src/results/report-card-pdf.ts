import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { create } from 'fontkit';
import type { ReportSnapshot } from '@classloom/db';
const latin = readFileSync(
  new URL('./fonts/NotoSans-Regular.ttf', import.meta.url),
);
const devanagari = readFileSync(
  new URL('./fonts/NotoSansDevanagari-Regular.ttf', import.meta.url),
);
const fonts = { latin: create(latin), devanagari: create(devanagari) };
const score = (n: number) => (n / 100).toFixed(2).replace(/\.00$/, '');
export async function reportCardPdf(
  input: { id: string; snapshot: ReportSnapshot; remarks: string | null },
  batch: { edition: number; status: string; publishedAt: Date | null },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 52, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: 'ClassLoom report card', Author: 'ClassLoom' },
    lang: 'en',
  });
  doc.registerFont('latin', latin);
  doc.registerFont('devanagari', devanagari);
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  let escaped = false;
  function text(value: string, size = 10, color = '#344054') {
    const font = /[\u0900-\u097f]/.test(value) ? 'devanagari' : 'latin';
    const coverage = fonts[font];
    const safe = Array.from(value)
      .map((c) => {
        if (
          c === '\n' ||
          c === '\t' ||
          ('hasGlyphForCodePoint' in coverage &&
            coverage.hasGlyphForCodePoint(c.codePointAt(0)!))
        )
          return c;
        escaped = true;
        return `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`;
      })
      .join('');
    doc
      .font(font)
      .fontSize(size)
      .fillColor(color)
      .text(safe, { width: 499, lineGap: 3 });
  }
  const s = input.snapshot;
  text(s.school.name, 20, '#101828');
  text(`${s.school.code} · ClassLoom`, 9);
  doc.moveDown();
  text('Report card', 24, '#101828');
  text(
    `${s.exam.name} · Edition ${batch.edition} · ${batch.status.toUpperCase()}`,
    10,
    batch.status === 'published' ? '#175CD3' : '#B54708',
  );
  if (batch.status !== 'published')
    text('This copy is not the current published report card.', 10, '#B54708');
  doc.moveDown();
  text(s.student.name, 16, '#101828');
  text(
    `Student ${s.student.code} · Admission ${s.student.admissionNumber} · Roll ${s.student.rollNumber ?? '—'}`,
  );
  text(`${s.sessionName} · ${s.className} · ${s.sectionName}`);
  text(
    `Date of birth: ${s.student.dateOfBirth} · Exam dates: ${s.exam.startDate} to ${s.exam.endDate}`,
  );
  doc.moveDown();
  text(
    `Overall: ${s.overall.outcome.toUpperCase()} · Grade ${s.overall.grade ?? '—'} · ${s.overall.percentage === null ? 'No overall percentage' : score(s.overall.percentage) + '%'}`,
    13,
    '#101828',
  );
  text(
    `Included marks: ${score(s.overall.earnedScore)} / ${score(s.overall.maximumScore)}`,
  );
  doc.moveDown();
  for (const subject of s.subjects) {
    if (doc.y > 690) doc.addPage();
    text(subject.name, 13, '#101828');
    text(
      `${subject.outcome.toUpperCase()} · ${score(subject.earnedScore)} / ${score(subject.maximumScore)} · ${subject.percentage === null ? '—' : score(subject.percentage) + '%'} · Grade ${subject.grade ?? '—'}`,
    );
    for (const paper of subject.assessments)
      text(
        `${paper.label} (${paper.date}): ${paper.status === 'scored' ? score(paper.score ?? 0) : paper.status.replace('_', ' ')} / ${score(paper.maximumScore)} · Passing ${score(paper.passingScore)}`,
        9,
      );
    doc.moveDown();
  }
  text('Staff remarks', 12, '#101828');
  text(input.remarks ?? 'No staff remarks.');
  doc.moveDown();
  text(
    `Grading policy: ${s.policy.name}, revision ${s.policy.revision}. Overall pass threshold: ${score(s.policy.overallPassingPercentage)}%. ${s.policy.requireSubjectPass ? 'Each included subject must pass.' : 'Subject failure does not alone determine the overall outcome.'}`,
    9,
  );
  text(
    'Absent counts as zero and fails. Exempt papers are excluded. Not assessed means incomplete. Percentages are truncated to two decimals; thresholds use the exact marks ratio.',
    9,
  );
  text(
    `Bands: ${s.policy.bands.map((b) => `${b.grade} >= ${score(b.minimumPercentage)}%`).join(' · ')}`,
    9,
  );
  if (escaped)
    text(
      'Characters outside the embedded font coverage are preserved above as Unicode code points [U+XXXX]. The online report displays the original text.',
      8,
    );
  if (batch.publishedAt)
    text(`Published: ${batch.publishedAt.toISOString().slice(0, 10)}`, 9);
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('latin')
      .fontSize(8)
      .fillColor('#667085')
      .text(`ClassLoom · ${input.id} · ${p + 1} / ${range.count}`, 48, 799, {
        width: 499,
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return output;
}
