import type { Book, Hadith } from "./index";

/**
 * 10 sample hadiths from Sahih al-Bukhari for local development.
 * These are widely-circulated, well-known hadiths reproduced here for
 * scaffolding purposes only. They will be replaced with the full corpus
 * once the user-provided dump arrives (see plan/05-roadmap.md Phase 1).
 *
 * English translation: Dr. Muhsin Khan (Darussalam edition), public-domain
 * matn text. Arabic is the well-attested classical text.
 */
// `hadith_number_label`, `chapter_title_ar`, and each grade's `grade_ar` are
// filled in by the `.map()` below (the fixtures are English-only), so these
// objects don't each have to repeat them.
type MockBase = Omit<Hadith, "hadith_number_label" | "chapter_title_ar" | "grades"> & {
  grades: { grader: string; grade: string }[] | null;
};
const MOCK_HADITHS_BASE: MockBase[] = [
  {
    id: "bukhari:1",
    collection: "bukhari",
    hadith_number: 1,
    arabic_number: 1,
    book_number: 1,
    book_name_en: "Revelation",
    chapter_number: 1,
    chapter_title_en: "How the Divine Revelation started being revealed to Allah's Messenger",
    in_book_ref: "Book 1, Hadith 1",
    usc_msa_ref: "Vol. 1, Book 1, Hadith 1",
    narrator: "Umar ibn al-Khattab",
    narrator_normalized: "umar ibn al khattab",
    text_en:
      "I heard Allah's Messenger saying, 'The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended. So whoever emigrated for worldly benefits or for a woman to marry, his emigration was for what he emigrated for.'",
    text_en_full:
      "Narrated Umar ibn al-Khattab: I heard Allah's Messenger saying, 'The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended. So whoever emigrated for worldly benefits or for a woman to marry, his emigration was for what he emigrated for.'",
    text_ar:
      "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى دنيا يصيبها أو إلى امرأة ينكحها فهجرته إلى ما هاجر إليه",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 41,
    language: "en",
  },
  {
    id: "bukhari:8",
    collection: "bukhari",
    hadith_number: 8,
    arabic_number: 8,
    book_number: 2,
    book_name_en: "Belief",
    chapter_number: 2,
    chapter_title_en: "The five pillars of Islam",
    in_book_ref: "Book 2, Hadith 1",
    usc_msa_ref: "Vol. 1, Book 2, Hadith 7",
    narrator: "Ibn Umar",
    narrator_normalized: "ibn umar",
    text_en:
      "Allah's Messenger said: Islam is based on five pillars: to testify that none has the right to be worshipped but Allah and Muhammad is Allah's Messenger, to offer the prayers, to pay Zakat, to perform Hajj, and to observe fast during the month of Ramadan.",
    text_en_full:
      "Narrated Ibn Umar: Allah's Messenger said: Islam is based on five pillars: to testify that none has the right to be worshipped but Allah and Muhammad is Allah's Messenger, to offer the prayers, to pay Zakat, to perform Hajj, and to observe fast during the month of Ramadan.",
    text_ar:
      "بني الإسلام على خمس شهادة أن لا إله إلا الله وأن محمدا رسول الله وإقام الصلاة وإيتاء الزكاة والحج وصوم رمضان",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 48,
    language: "en",
  },
  {
    id: "bukhari:135",
    collection: "bukhari",
    hadith_number: 135,
    arabic_number: 135,
    book_number: 4,
    book_name_en: "Ablutions (Wudu')",
    chapter_number: 1,
    chapter_title_en: "Ablution is essential for Salat",
    in_book_ref: "Book 4, Hadith 1",
    usc_msa_ref: "Vol. 1, Book 4, Hadith 135",
    narrator: "Abu Hurairah",
    narrator_normalized: "abu hurairah",
    text_en:
      "Allah's Messenger said: The prayer of any one of you who breaks his ablution is not accepted until he performs ablution again.",
    text_en_full:
      "Narrated Abu Hurairah: Allah's Messenger said: The prayer of any one of you who breaks his ablution is not accepted until he performs ablution again.",
    text_ar: "لا تقبل صلاة من أحدث حتى يتوضأ",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 196,
    language: "en",
  },
  {
    id: "bukhari:1891",
    collection: "bukhari",
    hadith_number: 1891,
    arabic_number: 1891,
    book_number: 30,
    book_name_en: "Fasting",
    chapter_number: 1,
    chapter_title_en: "The superiority of Saum (fasting)",
    in_book_ref: "Book 30, Hadith 1",
    usc_msa_ref: "Vol. 3, Book 31, Hadith 118",
    narrator: "Abu Hurairah",
    narrator_normalized: "abu hurairah",
    text_en:
      "Allah's Messenger said: Fasting is a shield (or a screen or a shelter from the Hell-Fire). So, the person observing the fast should avoid sexual relations with his wife and should not behave foolishly and impudently, and if somebody fights with him or abuses him, he should tell him twice, 'I am fasting.'",
    text_en_full:
      "Narrated Abu Hurairah: Allah's Messenger said: Fasting is a shield (or a screen or a shelter from the Hell-Fire). So, the person observing the fast should avoid sexual relations with his wife and should not behave foolishly and impudently, and if somebody fights with him or abuses him, he should tell him twice, 'I am fasting.'",
    text_ar: "الصيام جنة فلا يرفث ولا يجهل وإن امرؤ قاتله أو شاتمه فليقل إني صائم مرتين",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 2202,
    language: "en",
  },
  {
    id: "bukhari:2697",
    collection: "bukhari",
    hadith_number: 2697,
    arabic_number: 2697,
    book_number: 53,
    book_name_en: "Reconciliation",
    chapter_number: 5,
    chapter_title_en: "Innovations are rejected",
    in_book_ref: "Book 53, Hadith 7",
    usc_msa_ref: "Vol. 3, Book 49, Hadith 861",
    narrator: "Aishah",
    narrator_normalized: "aishah",
    text_en:
      "Allah's Messenger said: If somebody innovates something which is not in harmony with the principles of our religion, that thing is rejected.",
    text_en_full:
      "Narrated Aishah: Allah's Messenger said: If somebody innovates something which is not in harmony with the principles of our religion, that thing is rejected.",
    text_ar: "من أحدث في أمرنا هذا ما ليس منه فهو رد",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 3043,
    language: "en",
  },
  {
    id: "bukhari:2442",
    collection: "bukhari",
    hadith_number: 2442,
    arabic_number: 2442,
    book_number: 46,
    book_name_en: "Oppressions",
    chapter_number: 4,
    chapter_title_en: "Helping one's brother",
    in_book_ref: "Book 46, Hadith 5",
    usc_msa_ref: "Vol. 3, Book 43, Hadith 622",
    narrator: "Ibn Umar",
    narrator_normalized: "ibn umar",
    text_en:
      "Allah's Messenger said: A Muslim is a brother of another Muslim, so he should not oppress him, nor should he hand him over to an oppressor. Whoever fulfilled the needs of his brother, Allah will fulfill his needs.",
    text_en_full:
      "Narrated Ibn Umar: Allah's Messenger said: A Muslim is a brother of another Muslim, so he should not oppress him, nor should he hand him over to an oppressor. Whoever fulfilled the needs of his brother, Allah will fulfill his needs.",
    text_ar: "المسلم أخو المسلم لا يظلمه ولا يسلمه ومن كان في حاجة أخيه كان الله في حاجته",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 2761,
    language: "en",
  },
  {
    id: "bukhari:6018",
    collection: "bukhari",
    hadith_number: 6018,
    arabic_number: 6018,
    book_number: 78,
    book_name_en: "Good Manners and Form (Al-Adab)",
    chapter_number: 31,
    chapter_title_en: "To be kind to one's neighbour",
    in_book_ref: "Book 78, Hadith 47",
    usc_msa_ref: "Vol. 8, Book 73, Hadith 47",
    narrator: "Abu Hurairah",
    narrator_normalized: "abu hurairah",
    text_en:
      "Allah's Messenger said: Whoever believes in Allah and the Last Day, should not hurt his neighbour; and whoever believes in Allah and the Last Day, should serve his guest generously; and whoever believes in Allah and the Last Day, should speak what is good or keep silent.",
    text_en_full:
      "Narrated Abu Hurairah: Allah's Messenger said: Whoever believes in Allah and the Last Day, should not hurt his neighbour; and whoever believes in Allah and the Last Day, should serve his guest generously; and whoever believes in Allah and the Last Day, should speak what is good or keep silent.",
    text_ar:
      "من كان يؤمن بالله واليوم الآخر فلا يؤذ جاره ومن كان يؤمن بالله واليوم الآخر فليكرم ضيفه ومن كان يؤمن بالله واليوم الآخر فليقل خيرا أو ليصمت",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 6280,
    language: "en",
  },
  {
    id: "bukhari:13",
    collection: "bukhari",
    hadith_number: 13,
    arabic_number: 13,
    book_number: 2,
    book_name_en: "Belief",
    chapter_number: 7,
    chapter_title_en: "To love for the sake of Allah is part of faith",
    in_book_ref: "Book 2, Hadith 6",
    usc_msa_ref: "Vol. 1, Book 2, Hadith 12",
    narrator: "Anas",
    narrator_normalized: "anas",
    text_en:
      "The Prophet said: None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.",
    text_en_full:
      "Narrated Anas: The Prophet said: None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.",
    text_ar: "لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 53,
    language: "en",
  },
  {
    id: "bukhari:6011",
    collection: "bukhari",
    hadith_number: 6011,
    arabic_number: 6011,
    book_number: 78,
    book_name_en: "Good Manners and Form (Al-Adab)",
    chapter_number: 27,
    chapter_title_en: "The mercy of the people",
    in_book_ref: "Book 78, Hadith 40",
    usc_msa_ref: "Vol. 8, Book 73, Hadith 40",
    narrator: "An-Numan ibn Bashir",
    narrator_normalized: "an numan ibn bashir",
    text_en:
      "Allah's Messenger said: You see the believers as regards their being merciful among themselves and showing love among themselves and being kind, resembling one body, so that, if any part of the body is not well then the whole body shares the sleeplessness and fever with it.",
    text_en_full:
      "Narrated An-Numan ibn Bashir: Allah's Messenger said: You see the believers as regards their being merciful among themselves and showing love among themselves and being kind, resembling one body, so that, if any part of the body is not well then the whole body shares the sleeplessness and fever with it.",
    text_ar:
      "ترى المؤمنين في تراحمهم وتوادهم وتعاطفهم كمثل الجسد إذا اشتكى عضو تداعى له سائر الجسد بالسهر والحمى",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 6273,
    language: "en",
  },
  {
    id: "bukhari:2067",
    collection: "bukhari",
    hadith_number: 2067,
    arabic_number: 2067,
    book_number: 34,
    book_name_en: "Sales and Trade",
    chapter_number: 24,
    chapter_title_en: "The seller and buyer have the option as long as they have not separated",
    in_book_ref: "Book 34, Hadith 13",
    usc_msa_ref: "Vol. 3, Book 34, Hadith 293",
    narrator: "Hakim ibn Hizam",
    narrator_normalized: "hakim ibn hizam",
    text_en:
      "The Prophet said: The buyer and the seller have the option of cancelling or confirming the bargain, unless they separate. If both the parties speak the truth and describe the defects and qualities (of the goods), then they will be blessed in their bargain. But if they tell lies and conceal the defects, the blessing of their bargain will be lost.",
    text_en_full:
      "Narrated Hakim ibn Hizam: The Prophet said: The buyer and the seller have the option of cancelling or confirming the bargain, unless they separate. If both the parties speak the truth and describe the defects and qualities (of the goods), then they will be blessed in their bargain. But if they tell lies and conceal the defects, the blessing of their bargain will be lost.",
    text_ar:
      "البيعان بالخيار ما لم يتفرقا فإن صدقا وبينا بورك لهما في بيعهما وإن كتما وكذبا محقت بركة بيعهما",
    grades: [{ grader: "Sahih al-Bukhari", grade: "Sahih" }],
    urn: 2353,
    language: "en",
  },
];

export const MOCK_HADITHS: Hadith[] = MOCK_HADITHS_BASE.map((h) => ({
  ...h,
  hadith_number_label: String(h.hadith_number),
  // The fixtures carry no Arabic chapter name / grade; real corpus rows do.
  chapter_title_ar: null,
  grades: h.grades?.map((g) => ({ ...g, grade_ar: null })) ?? null,
}));

/**
 * The 10 sample books referenced by the mock hadiths above. Used for the
 * Browse UI before the real corpus arrives. Typed as Book[] to satisfy
 * BookSchema from shared-types.
 */
export const MOCK_BOOKS: Book[] = Array.from(
  new Map(
    MOCK_HADITHS.map((h) => [
      h.book_number,
      { book_number: h.book_number, book_name_en: h.book_name_en },
    ]),
  ).values(),
).sort((a, b) => a.book_number - b.book_number);
