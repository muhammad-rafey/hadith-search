export const TRANSLATORS = {
  bukhari: {
    name: "Sahih al-Bukhari",
    translator: "Dr. M. Muhsin Khan",
  },
  muslim: {
    name: "Sahih Muslim",
    translator: "Abdul Hamid Siddiqui",
  },
  ahmad: {
    name: "Musnad Ahmad",
    translator: "Nasir Khattab",
  },
};
export const getTranslator = (collection) =>
  TRANSLATORS[(collection || "").toLowerCase().trim()]?.translator ?? null;

export const getTranslatorCredit = (collection) => {
  const t = getTranslator(collection);
  return t ? `The translation provided here is by ${t}.` : "";
};
