-- =============================================================================
-- seed.sql — local-dev seed for hadith-search
-- =============================================================================
--
-- Loads the same 10 mock hadiths defined in
-- `packages/shared-types/src/mock-hadiths.ts` into the REAL schema
-- (`public.hadith_table`, the 1:1 sunnah-db mirror created by
-- 0003_hadith_table_raw.sql) plus a deterministic STUB EMBEDDING per row in
-- `public.hadith_embeddings` (keyed by arabicURN), so the full search pipeline
-- works end-to-end on a `supabase db reset` without calling Cohere/BGE.
--
-- This is the lightweight dev loop. The real ~45k-row corpus is loaded
-- out-of-band by scripts/load_chunks.mjs + the embedding ingest — NOT by this
-- seed. English seed only; the bilingual FTS leg still works (it ORs an Arabic
-- 'simple' predicate that simply finds nothing in the English-only mock text).
--
-- Stub embedding strategy: seed Postgres' RNG with a hash of the arabicURN,
-- generate 1024 floats in (-1, 1), unit-normalize (cosine HNSW). Reproducible
-- per row, "spread out" enough for the index to do something locally. Tagged
-- with the default model id so the query-time provider-match guard stays quiet.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: deterministic 1024-d unit-norm halfvec(1024) keyed off a text seed.
-- -----------------------------------------------------------------------------
-- `volatile` because it calls setseed/random(); a `stable` marker would let the
-- planner cache one result across all rows. Only called from the seed below.
create or replace function public._stub_embedding(p_id text)
returns halfvec(1024)
language plpgsql volatile as $$
declare
  seed_val   float8;
  arr        real[];
  norm       float8 := 0;
  i          int;
  v          float8;
begin
  seed_val := (hashtext(p_id)::float8) / 2147483648.0;
  if seed_val >= 1 then seed_val := 0.999999; end if;
  if seed_val <= -1 then seed_val := -0.999999; end if;
  perform setseed(seed_val);

  arr := array_fill(0::real, ARRAY[1024]);
  for i in 1..1024 loop
    v := random() * 2.0 - 1.0;
    arr[i] := v::real;
    norm := norm + v * v;
  end loop;

  norm := sqrt(norm);
  if norm = 0 then norm := 1; end if;

  for i in 1..1024 loop
    arr[i] := (arr[i]::float8 / norm)::real;
  end loop;

  return arr::halfvec(1024);
end;
$$;

-- -----------------------------------------------------------------------------
-- hadith_table — 10 mock Bukhari rows (mirrors MOCK_HADITHS).
-- -----------------------------------------------------------------------------
-- Columns map: arabicURN<-urn, bookNumber<-book_number, hadithNumber<-hadith_number,
-- ourHadithNumber<-in-book seq, englishBabName<-chapter_title_en, englishText<-the
-- full "Narrated X: ..." body (the mappers extract+strip the narrator from it),
-- arabicText<-text_ar. babID/englishURN/grades/xrefs filled with valid stand-ins
-- so the NOT NULL columns of the raw mirror are satisfied.
insert into public.hadith_table (
  "collection", "bookNumber", "babID", "hadithNumber", "ourHadithNumber",
  "arabicURN", "englishURN", "englishBabName", "englishText", "arabicText",
  "englishgrade1", "arabicgrade1", "xrefs"
) values
(
  'bukhari', '1', 1, '1', 1, 41, 41,
  'How the Divine Revelation started being revealed to Allah''s Messenger',
  'Narrated Umar ibn al-Khattab: I heard Allah''s Messenger saying, ''The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended. So whoever emigrated for worldly benefits or for a woman to marry, his emigration was for what he emigrated for.''',
  'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى دنيا يصيبها أو إلى امرأة ينكحها فهجرته إلى ما هاجر إليه',
  'Sahih', '', ''
),
(
  'bukhari', '2', 2, '8', 1, 48, 48,
  'The five pillars of Islam',
  'Narrated Ibn Umar: Allah''s Messenger said: Islam is based on five pillars: to testify that none has the right to be worshipped but Allah and Muhammad is Allah''s Messenger, to offer the prayers, to pay Zakat, to perform Hajj, and to observe fast during the month of Ramadan.',
  'بني الإسلام على خمس شهادة أن لا إله إلا الله وأن محمدا رسول الله وإقام الصلاة وإيتاء الزكاة والحج وصوم رمضان',
  'Sahih', '', ''
),
(
  'bukhari', '4', 1, '135', 1, 196, 196,
  'Ablution is essential for Salat',
  'Narrated Abu Hurairah: Allah''s Messenger said: The prayer of any one of you who breaks his ablution is not accepted until he performs ablution again.',
  'لا تقبل صلاة من أحدث حتى يتوضأ',
  'Sahih', '', ''
),
(
  'bukhari', '30', 1, '1891', 1, 2202, 2202,
  'The superiority of Saum (fasting)',
  'Narrated Abu Hurairah: Allah''s Messenger said: Fasting is a shield (or a screen or a shelter from the Hell-Fire). So, the person observing the fast should avoid sexual relations with his wife and should not behave foolishly and impudently, and if somebody fights with him or abuses him, he should tell him twice, ''I am fasting.''',
  'الصيام جنة فلا يرفث ولا يجهل وإن امرؤ قاتله أو شاتمه فليقل إني صائم مرتين',
  'Sahih', '', ''
),
(
  'bukhari', '53', 5, '2697', 7, 3043, 3043,
  'Innovations are rejected',
  'Narrated Aishah: Allah''s Messenger said: If somebody innovates something which is not in harmony with the principles of our religion, that thing is rejected.',
  'من أحدث في أمرنا هذا ما ليس منه فهو رد',
  'Sahih', '', ''
),
(
  'bukhari', '46', 4, '2442', 5, 2761, 2761,
  'Helping one''s brother',
  'Narrated Ibn Umar: Allah''s Messenger said: A Muslim is a brother of another Muslim, so he should not oppress him, nor should he hand him over to an oppressor. Whoever fulfilled the needs of his brother, Allah will fulfill his needs.',
  'المسلم أخو المسلم لا يظلمه ولا يسلمه ومن كان في حاجة أخيه كان الله في حاجته',
  'Sahih', '', ''
),
(
  'bukhari', '78', 31, '6018', 47, 6280, 6280,
  'To be kind to one''s neighbour',
  'Narrated Abu Hurairah: Allah''s Messenger said: Whoever believes in Allah and the Last Day, should not hurt his neighbour; and whoever believes in Allah and the Last Day, should serve his guest generously; and whoever believes in Allah and the Last Day, should speak what is good or keep silent.',
  'من كان يؤمن بالله واليوم الآخر فلا يؤذ جاره ومن كان يؤمن بالله واليوم الآخر فليكرم ضيفه ومن كان يؤمن بالله واليوم الآخر فليقل خيرا أو ليصمت',
  'Sahih', '', ''
),
(
  'bukhari', '2', 7, '13', 6, 53, 53,
  'To love for the sake of Allah is part of faith',
  'Narrated Anas: The Prophet said: None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.',
  'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  'Sahih', '', ''
),
(
  'bukhari', '78', 27, '6011', 40, 6273, 6273,
  'The mercy of the people',
  'Narrated An-Numan ibn Bashir: Allah''s Messenger said: You see the believers as regards their being merciful among themselves and showing love among themselves and being kind, resembling one body, so that, if any part of the body is not well then the whole body shares the sleeplessness and fever with it.',
  'ترى المؤمنين في تراحمهم وتوادهم وتعاطفهم كمثل الجسد إذا اشتكى عضو تداعى له سائر الجسد بالسهر والحمى',
  'Sahih', '', ''
),
(
  'bukhari', '34', 24, '2067', 13, 2353, 2353,
  'The seller and buyer have the option as long as they have not separated',
  'Narrated Hakim ibn Hizam: The Prophet said: The buyer and the seller have the option of cancelling or confirming the bargain, unless they separate. If both the parties speak the truth and describe the defects and qualities (of the goods), then they will be blessed in their bargain. But if they tell lies and conceal the defects, the blessing of their bargain will be lost.',
  'البيعان بالخيار ما لم يتفرقا فإن صدقا وبينا بورك لهما في بيعهما وإن كتما وكذبا محقت بركة بيعهما',
  'Sahih', '', ''
)
on conflict ("arabicURN") do nothing;

-- -----------------------------------------------------------------------------
-- hadith_embeddings — one stub vector per seeded row (keyed by arabicURN).
-- -----------------------------------------------------------------------------
insert into public.hadith_embeddings (arabic_urn, embedding, model, text_hash)
select h."arabicURN", public._stub_embedding(h."arabicURN"::text), 'embed-v4.0', 'stub'
from public.hadith_table h
where h.collection = 'bukhari'
on conflict (arabic_urn) do nothing;
