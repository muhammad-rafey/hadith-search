-- =============================================================================
-- seed.sql — local-dev seed for hadith-search
-- =============================================================================
--
-- Loads the same 10 mock hadiths defined in
-- `packages/shared-types/src/mock-hadiths.ts` (the contract between web and
-- backend) plus a deterministic STUB EMBEDDING per row so the schema works
-- end-to-end without calling Cohere.
--
-- Stub embedding strategy:
--   * For each hadith id, seed Postgres' RNG with a hash of the id.
--   * Generate 1024 floats in (-1, 1), then unit-normalize so cosine distance
--     between two stubs is meaningful (the HNSW index uses cosine).
--   * `setseed` accepts a value in [-1, 1]; we map abs(hashtext(id)) into a
--     small float so each row gets a distinct, reproducible vector.
--
-- This makes `setseed`+`random()` deterministic for a given id while still
-- producing vectors that look "spread out" enough for the index to do
-- something meaningful in local dev. Production embeddings will overwrite
-- these once the real Cohere ingestion runs.
--
-- English seed only for v1; Arabic and Urdu rows arrive with the real corpus.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: deterministic 1024-d unit-norm halfvec(1024) keyed off a text id.
-- -----------------------------------------------------------------------------
-- Marked `volatile` because it calls `setseed`/`random()`; a `stable` marker
-- would let the planner cache results across rows, which would produce the
-- same vector for every row. We only call this from the seed inserts below,
-- so volatility is fine here.
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
  -- hashtext returns int4 in [-2^31, 2^31); map to [-1, 1].
  seed_val := (hashtext(p_id)::float8) / 2147483648.0;
  if seed_val >= 1 then seed_val := 0.999999; end if;
  if seed_val <= -1 then seed_val := -0.999999; end if;
  perform setseed(seed_val);

  -- Pre-size the array so the inner loop is O(n) instead of O(n^2).
  arr := array_fill(0::real, ARRAY[1024]);
  for i in 1..1024 loop
    -- random() is [0,1); shift to (-1, 1).
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
-- hadiths
-- -----------------------------------------------------------------------------
-- Mirrors `MOCK_HADITHS` from packages/shared-types/src/mock-hadiths.ts.
-- Keep the two in sync if either changes.

insert into public.hadiths (
  id, collection, hadith_number, arabic_number, book_number, book_name_en,
  chapter_number, chapter_title_en, in_book_ref, usc_msa_ref,
  narrator, narrator_normalized, text_en, text_en_full, text_ar,
  grades, urn, language
) values
(
  'bukhari:1', 'bukhari', 1, 1, 1, 'Revelation',
  1, 'How the Divine Revelation started being revealed to Allah''s Messenger',
  'Book 1, Hadith 1', 'Vol. 1, Book 1, Hadith 1',
  'Umar ibn al-Khattab', 'umar ibn al khattab',
  'I heard Allah''s Messenger saying, ''The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended. So whoever emigrated for worldly benefits or for a woman to marry, his emigration was for what he emigrated for.''',
  'Narrated Umar ibn al-Khattab: I heard Allah''s Messenger saying, ''The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended. So whoever emigrated for worldly benefits or for a woman to marry, his emigration was for what he emigrated for.''',
  'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى فمن كانت هجرته إلى دنيا يصيبها أو إلى امرأة ينكحها فهجرته إلى ما هاجر إليه',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 41, 'en'
),
(
  'bukhari:8', 'bukhari', 8, 8, 2, 'Belief',
  2, 'The five pillars of Islam',
  'Book 2, Hadith 1', 'Vol. 1, Book 2, Hadith 7',
  'Ibn Umar', 'ibn umar',
  'Allah''s Messenger said: Islam is based on five pillars: to testify that none has the right to be worshipped but Allah and Muhammad is Allah''s Messenger, to offer the prayers, to pay Zakat, to perform Hajj, and to observe fast during the month of Ramadan.',
  'Narrated Ibn Umar: Allah''s Messenger said: Islam is based on five pillars: to testify that none has the right to be worshipped but Allah and Muhammad is Allah''s Messenger, to offer the prayers, to pay Zakat, to perform Hajj, and to observe fast during the month of Ramadan.',
  'بني الإسلام على خمس شهادة أن لا إله إلا الله وأن محمدا رسول الله وإقام الصلاة وإيتاء الزكاة والحج وصوم رمضان',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 48, 'en'
),
(
  'bukhari:135', 'bukhari', 135, 135, 4, 'Ablutions (Wudu'')',
  1, 'Ablution is essential for Salat',
  'Book 4, Hadith 1', 'Vol. 1, Book 4, Hadith 135',
  'Abu Hurairah', 'abu hurairah',
  'Allah''s Messenger said: The prayer of any one of you who breaks his ablution is not accepted until he performs ablution again.',
  'Narrated Abu Hurairah: Allah''s Messenger said: The prayer of any one of you who breaks his ablution is not accepted until he performs ablution again.',
  'لا تقبل صلاة من أحدث حتى يتوضأ',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 196, 'en'
),
(
  'bukhari:1891', 'bukhari', 1891, 1891, 30, 'Fasting',
  1, 'The superiority of Saum (fasting)',
  'Book 30, Hadith 1', 'Vol. 3, Book 31, Hadith 118',
  'Abu Hurairah', 'abu hurairah',
  'Allah''s Messenger said: Fasting is a shield (or a screen or a shelter from the Hell-Fire). So, the person observing the fast should avoid sexual relations with his wife and should not behave foolishly and impudently, and if somebody fights with him or abuses him, he should tell him twice, ''I am fasting.''',
  'Narrated Abu Hurairah: Allah''s Messenger said: Fasting is a shield (or a screen or a shelter from the Hell-Fire). So, the person observing the fast should avoid sexual relations with his wife and should not behave foolishly and impudently, and if somebody fights with him or abuses him, he should tell him twice, ''I am fasting.''',
  'الصيام جنة فلا يرفث ولا يجهل وإن امرؤ قاتله أو شاتمه فليقل إني صائم مرتين',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 2202, 'en'
),
(
  'bukhari:2697', 'bukhari', 2697, 2697, 53, 'Reconciliation',
  5, 'Innovations are rejected',
  'Book 53, Hadith 7', 'Vol. 3, Book 49, Hadith 861',
  'Aishah', 'aishah',
  'Allah''s Messenger said: If somebody innovates something which is not in harmony with the principles of our religion, that thing is rejected.',
  'Narrated Aishah: Allah''s Messenger said: If somebody innovates something which is not in harmony with the principles of our religion, that thing is rejected.',
  'من أحدث في أمرنا هذا ما ليس منه فهو رد',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 3043, 'en'
),
(
  'bukhari:2442', 'bukhari', 2442, 2442, 46, 'Oppressions',
  4, 'Helping one''s brother',
  'Book 46, Hadith 5', 'Vol. 3, Book 43, Hadith 622',
  'Ibn Umar', 'ibn umar',
  'Allah''s Messenger said: A Muslim is a brother of another Muslim, so he should not oppress him, nor should he hand him over to an oppressor. Whoever fulfilled the needs of his brother, Allah will fulfill his needs.',
  'Narrated Ibn Umar: Allah''s Messenger said: A Muslim is a brother of another Muslim, so he should not oppress him, nor should he hand him over to an oppressor. Whoever fulfilled the needs of his brother, Allah will fulfill his needs.',
  'المسلم أخو المسلم لا يظلمه ولا يسلمه ومن كان في حاجة أخيه كان الله في حاجته',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 2761, 'en'
),
(
  'bukhari:6018', 'bukhari', 6018, 6018, 78, 'Good Manners and Form (Al-Adab)',
  31, 'To be kind to one''s neighbour',
  'Book 78, Hadith 47', 'Vol. 8, Book 73, Hadith 47',
  'Abu Hurairah', 'abu hurairah',
  'Allah''s Messenger said: Whoever believes in Allah and the Last Day, should not hurt his neighbour; and whoever believes in Allah and the Last Day, should serve his guest generously; and whoever believes in Allah and the Last Day, should speak what is good or keep silent.',
  'Narrated Abu Hurairah: Allah''s Messenger said: Whoever believes in Allah and the Last Day, should not hurt his neighbour; and whoever believes in Allah and the Last Day, should serve his guest generously; and whoever believes in Allah and the Last Day, should speak what is good or keep silent.',
  'من كان يؤمن بالله واليوم الآخر فلا يؤذ جاره ومن كان يؤمن بالله واليوم الآخر فليكرم ضيفه ومن كان يؤمن بالله واليوم الآخر فليقل خيرا أو ليصمت',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 6280, 'en'
),
(
  'bukhari:13', 'bukhari', 13, 13, 2, 'Belief',
  7, 'To love for the sake of Allah is part of faith',
  'Book 2, Hadith 6', 'Vol. 1, Book 2, Hadith 12',
  'Anas', 'anas',
  'The Prophet said: None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.',
  'Narrated Anas: The Prophet said: None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.',
  'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 53, 'en'
),
(
  'bukhari:6011', 'bukhari', 6011, 6011, 78, 'Good Manners and Form (Al-Adab)',
  27, 'The mercy of the people',
  'Book 78, Hadith 40', 'Vol. 8, Book 73, Hadith 40',
  'An-Numan ibn Bashir', 'an numan ibn bashir',
  'Allah''s Messenger said: You see the believers as regards their being merciful among themselves and showing love among themselves and being kind, resembling one body, so that, if any part of the body is not well then the whole body shares the sleeplessness and fever with it.',
  'Narrated An-Numan ibn Bashir: Allah''s Messenger said: You see the believers as regards their being merciful among themselves and showing love among themselves and being kind, resembling one body, so that, if any part of the body is not well then the whole body shares the sleeplessness and fever with it.',
  'ترى المؤمنين في تراحمهم وتوادهم وتعاطفهم كمثل الجسد إذا اشتكى عضو تداعى له سائر الجسد بالسهر والحمى',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 6273, 'en'
),
(
  'bukhari:2067', 'bukhari', 2067, 2067, 34, 'Sales and Trade',
  24, 'The seller and buyer have the option as long as they have not separated',
  'Book 34, Hadith 13', 'Vol. 3, Book 34, Hadith 293',
  'Hakim ibn Hizam', 'hakim ibn hizam',
  'The Prophet said: The buyer and the seller have the option of cancelling or confirming the bargain, unless they separate. If both the parties speak the truth and describe the defects and qualities (of the goods), then they will be blessed in their bargain. But if they tell lies and conceal the defects, the blessing of their bargain will be lost.',
  'Narrated Hakim ibn Hizam: The Prophet said: The buyer and the seller have the option of cancelling or confirming the bargain, unless they separate. If both the parties speak the truth and describe the defects and qualities (of the goods), then they will be blessed in their bargain. But if they tell lies and conceal the defects, the blessing of their bargain will be lost.',
  'البيعان بالخيار ما لم يتفرقا فإن صدقا وبينا بورك لهما في بيعهما وإن كتما وكذبا محقت بركة بيعهما',
  '[{"grader":"Sahih al-Bukhari","grade":"Sahih"}]'::jsonb, 2353, 'en'
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- hadith_embeddings — one stub vector per hadith.
-- -----------------------------------------------------------------------------
insert into public.hadith_embeddings (hadith_id, embedding, model)
select h.id, public._stub_embedding(h.id), 'stub-deterministic'
from public.hadiths h
on conflict (hadith_id) do nothing;
