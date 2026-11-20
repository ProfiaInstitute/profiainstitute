import { zipSync } from "fflate";
import { orderCatPaperQuestions } from "@/lib/cat-question-groups";
import type { AdminCat, CatOptionKey } from "@/lib/cats";

type CatDocumentData = Pick<
  AdminCat,
  "title" | "name" | "courseTitle" | "durationMinutes" | "instructions" | "questions"
>;

const xmlEncoder = new TextEncoder();
const optionKeys: CatOptionKey[] = ["A", "B", "C", "D"];

function xmlText(value: string) {
  const validXmlText = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
  return validXmlText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textRuns(value: string) {
  return value
    .split(/\r\n?|\n/)
    .map(
      (line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${xmlText(line)}</w:t>`,
    )
    .join("");
}

function paragraph(
  value: string,
  options: {
    bold?: boolean;
    size?: number;
    centered?: boolean;
    indent?: number;
    after?: number;
  } = {},
) {
  const paragraphProperties = [
    options.centered ? '<w:jc w:val="center"/>' : "",
    options.indent ? `<w:ind w:left="${options.indent}"/>` : "",
    `<w:spacing w:after="${options.after ?? 120}"/>`,
  ].join("");
  const runProperties = [
    options.bold ? "<w:b/>" : "",
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${paragraphProperties}</w:pPr><w:r><w:rPr>${runProperties}</w:rPr>${textRuns(value)}</w:r></w:p>`;
}

function catDocumentBody(cat: CatDocumentData) {
  const totalMarks = cat.questions.reduce((total, question) => total + question.points, 0);
  const questions = orderCatPaperQuestions(cat.questions);
  const body = [
    paragraph("CAT PAPER", { bold: true, size: 32, centered: true, after: 100 }),
    paragraph(cat.title, { bold: true, size: 28, centered: true, after: 220 }),
    paragraph(`Course: ${cat.courseTitle}`),
    paragraph(`CAT: ${cat.name}`),
    paragraph(`Time allowed: ${cat.durationMinutes} minutes`),
    paragraph(`Total marks: ${totalMarks}`, { after: 220 }),
  ];

  if (cat.instructions?.trim()) {
    body.push(paragraph("Instructions", { bold: true, after: 60 }));
    body.push(paragraph(cat.instructions, { after: 220 }));
  }
  let activeGroup: string | null = null;
  questions.forEach((question, index) => {
    if (question.sharedGroup && question.sharedGroup !== activeGroup) {
      activeGroup = question.sharedGroup;
      body.push(paragraph(question.sharedGroup, { bold: true, size: 24, after: 60 }));
      if (question.sharedPrompt) body.push(paragraph(question.sharedPrompt, { after: 160 }));
    }
    body.push(
      paragraph(`${index + 1}. ${question.prompt} (${question.points} marks)`, {
        bold: true,
        after: 60,
      }),
    );
    optionKeys.forEach((key) => {
      body.push(paragraph(`${key}. ${question.options[key]}`, { indent: 360, after: 40 }));
    });
    body.push(paragraph("", { after: 100 }));
  });

  return body.join("");
}

export function createCatDocument(cat: CatDocumentData) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${catDocumentBody(cat)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  return zipSync({
    "[Content_Types].xml": xmlEncoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": xmlEncoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    ),
    "word/document.xml": xmlEncoder.encode(documentXml),
  });
}
