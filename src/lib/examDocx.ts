/**
 * 把考卷題目組成真正的 Word .docx（OOXML），可在 Word 直接編輯。
 * buildExamDocument 為純函式（回 docx Document），方便用 Packer.toBuffer 做單元測試。
 */
import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
} from "docx";
import { ExamQuestion, ExamQuestionType } from "../types";

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  "multiple-choice": "選擇題",
  "true-false": "是非題",
  "fill-in-the-blank": "填空題",
};

const FONT = "Microsoft JhengHei";
const ANSWER_COLOR = "C00000";

export interface ExamDocOptions {
  title: string;
  courseName: string;
  questions: ExamQuestion[];
  withAnswer: boolean;
}

function questionParagraphs(q: ExamQuestion, index: number, withAnswer: boolean): Paragraph[] {
  const out: Paragraph[] = [];
  // 題幹：「1. 題目 (X分・題型)」
  out.push(
    new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [
        new TextRun({ text: `${index + 1}. `, bold: true, font: FONT }),
        new TextRun({ text: q.question || "", font: FONT }),
        new TextRun({ text: `  (${q.points}分・${TYPE_LABEL[q.type]})`, size: 18, color: "888888", font: FONT }),
      ],
    })
  );

  if (q.type === "multiple-choice" && q.options) {
    for (const [k, v] of Object.entries(q.options)) {
      const isAns = withAnswer && q.correctAnswer === k;
      out.push(
        new Paragraph({
          indent: { left: 480 },
          spacing: { after: 20 },
          children: [
            new TextRun({ text: `(${k}) ${v}`, font: FONT, bold: isAns, color: isAns ? ANSWER_COLOR : undefined }),
          ],
        })
      );
    }
  } else if (q.type === "true-false") {
    out.push(
      new Paragraph({
        indent: { left: 480 },
        spacing: { after: 20 },
        children: [
          new TextRun({ text: "（　）是非", font: FONT }),
          ...(withAnswer
            ? [new TextRun({ text: `　正解：${q.correctAnswer}`, font: FONT, bold: true, color: ANSWER_COLOR })]
            : []),
        ],
      })
    );
  } else {
    out.push(
      new Paragraph({
        indent: { left: 480 },
        spacing: { after: 20 },
        children: [
          new TextRun({ text: "作答：__________________", font: FONT }),
          ...(withAnswer
            ? [new TextRun({ text: `　正解：${q.correctAnswer}`, font: FONT, bold: true, color: ANSWER_COLOR })]
            : []),
        ],
      })
    );
  }
  return out;
}

export function buildExamDocument(opts: ExamDocOptions): Document {
  const { title, courseName, questions, withAnswer } = opts;
  const total = questions.reduce((s, q) => s + (q.points || 0), 0);

  const head: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
      children: [new TextRun({ text: title + (withAnswer ? "（教師答案卷）" : ""), bold: true, font: FONT, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "111111", space: 6 } },
      children: [
        new TextRun({ text: `${courseName}　│　滿分：${total} 分　共 ${questions.length} 題`, font: FONT, size: 20, color: "444444" }),
      ],
    }),
  ];

  if (!withAnswer) {
    head.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({ text: "班級：__________　座號：______　姓名：__________　學號：__________", font: FONT, size: 20 }),
        ],
      })
    );
  }

  const body = questions.flatMap((q, i) => questionParagraphs(q, i, withAnswer));

  return new Document({
    creator: "EduGrade AI",
    title,
    sections: [{ properties: {}, children: [...head, ...body] }],
  });
}
