// Вопросы витрины на других языках. Русский источник — config/seo.json: его же берёт разметка
// FAQPage для Google (server/seo.mjs), поэтому русские вопросы остаются там, а здесь — переводы
// в том же порядке. Поменяли вопрос в seo.json — поправь и здесь.
// «[текст](/адрес)» — ссылка, как в seo.json.
export const faq: Record<'en' | 'sq', {q: string; a: string}[]> = {
  en: [
    {q: 'Do I need a card to try it?', a: 'No. Sign-up and trial credits need no payment. If you decide to continue, choose a plan in your account and pay online — the credits arrive automatically.'},
    {q: 'Can I get a refund?', a: 'Yes, within 3 days of payment, if the credits from that purchase have not been used: send us a refund request on Telegram. If a video fails to build, the credit comes back automatically. Details are in the [offer](/offer).'},
    {q: 'What if the listing is removed from the marketplace?', a: 'Nothing happens: photos are copied to us when you create a post, so the finished video and carousel do not depend on the listing.'},
    {q: 'Can I use my own logo and colours?', a: 'Yes. Brand settings have your logo, palette, fonts and contacts. Set them once and they appear on every video and carousel.'},
    {q: 'What language are the texts in?', a: 'In your profile language: specs and captions are translated automatically. Carousels are available in Russian or English.'},
  ],
  sq: [
    {q: 'A më duhet kartë për ta provuar?', a: 'Jo. Regjistrimi dhe kreditet e provës janë pa pagesë. Nëse vendosni të vazhdoni, zgjidhni një paketë në llogari dhe paguani online — kreditet vijnë vetë.'},
    {q: 'A mund të marr paratë mbrapsht?', a: 'Po, brenda 3 ditëve pas pagesës, nëse kreditet e blerjes nuk janë përdorur ende: na dërgoni kërkesën për rimbursim në Telegram. Nëse krijimi i videos dështon, krediti kthehet vetë. Më shumë — në [ofertë](/offer).'},
    {q: 'Çfarë ndodh nëse shpallja hiqet nga platforma?', a: 'Asgjë: fotot kopjohen te ne gjatë krijimit, ndaj videoja dhe karuseli i gatshëm nuk varen nga shpallja.'},
    {q: 'A mund të vendos logon dhe ngjyrat e mia?', a: 'Po. Te cilësimet e markës — logoja, paleta, shkronjat dhe kontaktet. Një herë, dhe ato shfaqen në çdo video dhe karusel.'},
    {q: 'Në çfarë gjuhe janë tekstet?', a: 'Në gjuhën e profilit tuaj: të dhënat teknike dhe titrat përkthehen vetë. Karuselet — në rusisht ose anglisht.'},
  ],
};
