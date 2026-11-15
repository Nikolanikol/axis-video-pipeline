// Тексты ошибок для клиента на его языке (15.11: один переключатель RU · EN · SQ на всё).
//
// Ошибки по коду пишутся по-русски, как и раньше (HttpError, ошибки ядер) — так их читают
// журнал, тревоги и тесты. Переводит их общий обработчик ответа (server/app.mjs) по заголовку
// X-Lang, который интерфейс шлёт с каждым запросом (app/api.ts). Ключ — русский текст, где
// подстановки `${…}` заменены на {}: значения переносятся в перевод по порядку.
//
// Нового текста нет в словаре — клиент увидит его по-русски (не пусто и не ключ). Новая ошибка
// для клиента — добавь строку сюда; `tools/i18n-errors.mjs` покажет, каких строк не хватает.
// Не переводим: админку, настройку касс и ядер (это видит только команда), обзоры (скрыты на проде).
// Албанский — машинный перевод, перед запуском вычитывает носитель.

/** @type {Record<string, [en: string, sq: string]>} */
const DICT = {
  // ——— Вход, регистрация, кабинет ———
  'Проверь почту: похоже, в адресе ошибка': ['Check your email — the address seems to have a typo', 'Kontrolloni email-in — adresa duket se ka gabim'],
  'Пароль — не короче 8 символов': ['The password must be at least 8 characters', 'Fjalëkalimi duhet të ketë të paktën 8 karaktere'],
  'Слишком длинный пароль': ['The password is too long', 'Fjalëkalimi është shumë i gjatë'],
  'Проверь телефон: нужен номер с кодом страны, например +389 70 123 456': ['Check the phone: it needs a country code, e.g. +389 70 123 456', 'Kontrolloni telefonin: duhet me kodin e shtetit, p.sh. +389 70 123 456'],
  'Как вас зовут?': ['What is your name?', 'Si quheni?'],
  'Эта почта уже зарегистрирована — войдите': ['This email is already registered — please sign in', 'Ky email është regjistruar tashmë — hyni'],
  'Этот телефон уже зарегистрирован — войдите по своей почте': ['This phone is already registered — sign in with your email', 'Ky telefon është regjistruar tashmë — hyni me email-in tuaj'],
  'Одноразовая почта не подойдёт — укажите рабочую: на неё придёт код подтверждения': ['Disposable email won’t work — use a real one: the confirmation code will be sent there', 'Email-i i përkohshëm nuk vlen — përdorni një të vërtetë: aty do të vijë kodi i konfirmimit'],
  'Нет такого пользователя': ['No such user', 'Nuk ka përdorues të tillë'],
  'Письмо уже отправлено — повторить можно через {} с': ['The email has already been sent — you can resend in {} s', 'Email-i është dërguar — mund ta ridërgoni pas {} s'],
  'Код устарел — отправьте новый': ['The code has expired — send a new one', 'Kodi ka skaduar — dërgoni një të ri'],
  'Слишком много неверных попыток — отправьте новый код': ['Too many wrong attempts — send a new code', 'Shumë përpjekje të gabuara — dërgoni një kod të ri'],
  'Неверный код — проверьте письмо': ['Wrong code — check the email', 'Kod i gabuar — kontrolloni email-in'],
  'Ссылка устарела или уже использована — войдите и запросите новый код': ['The link has expired or was already used — sign in and request a new code', 'Lidhja ka skaduar ose është përdorur — hyni dhe kërkoni një kod të ri'],
  'Ссылка устарела или уже использована — запросите сброс ещё раз': ['The link has expired or was already used — request a reset again', 'Lidhja ka skaduar ose është përdorur — kërkoni rivendosjen përsëri'],
  'Ссылка устарела или уже использована': ['The link has expired or was already used', 'Lidhja ka skaduar ose është përdorur'],
  'Неверная почта или пароль': ['Wrong email or password', 'Email ose fjalëkalim i gabuar'],
  'Аккаунт удаляется. До {} его можно восстановить по ссылке из письма': ['The account is being deleted. Until {} you can restore it with the link from the email', 'Llogaria po fshihet. Deri më {} mund ta riktheni me lidhjen nga email-i'],
  'Кабинет закрыт. Если это ошибка — напишите нам': ['The account is closed. If this is a mistake, contact us', 'Llogaria është mbyllur. Nëse është gabim, na shkruani'],
  'Неверный текущий пароль': ['Wrong current password', 'Fjalëkalimi aktual është i gabuar'],
  'Название компании не может быть пустым': ['The company name cannot be empty', 'Emri i kompanisë nuk mund të jetë bosh'],
  'Название компании меняет владелец кабинета': ['Only the account owner can change the company name', 'Emrin e kompanisë e ndryshon vetëm pronari i llogarisë'],
  'Новый пароль совпадает с текущим': ['The new password is the same as the current one', 'Fjalëkalimi i ri është i njëjtë me atë aktual'],
  'Это и есть ваша почта': ['That is already your email', 'Ky është tashmë email-i juaj'],
  'Одноразовая почта не подойдёт — укажите рабочую': ['Disposable email won’t work — use a real one', 'Email-i i përkohshëm nuk vlen — përdorni një të vërtetë'],
  'Эта почта уже занята другим аккаунтом': ['This email is already used by another account', 'Ky email përdoret nga një llogari tjetër'],
  'Язык — ru, en или sq': ['Language must be ru, en or sq', 'Gjuha duhet të jetë ru, en ose sq'],
  'Это текущий вход — для него есть кнопка «Выйти»': ['This is your current session — use “Sign out” for it', 'Ky është seanca aktuale — përdorni «Dil»'],
  'Такого входа уже нет': ['That session no longer exists', 'Ky seancë nuk ekziston më'],
  'Удалить кабинет может только его владелец': ['Only the owner can delete the account', 'Llogarinë mund ta fshijë vetëm pronari'],
  'Название компании набрано не так — проверьте': ['The company name doesn’t match — please check', 'Emri i kompanisë nuk përputhet — kontrolloni'],
  'Аккаунт уже удалён окончательно — восстановить нельзя': ['The account has been permanently deleted and cannot be restored', 'Llogaria është fshirë përfundimisht dhe nuk mund të rikthehet'],
  'Нет такого тарифа': ['No such plan', 'Nuk ka plan të tillë'],
  'Нет такого действующего пакета': ['No such active package', 'Nuk ka paketë aktive të tillë'],
  'Нужно войти': ['Please sign in', 'Ju lutem hyni'],
  'У аккаунта нет компании — напишите владельцу платформы': ['Your account has no company — contact the platform owner', 'Llogaria juaj nuk ka kompani — kontaktoni pronarin e platformës'],
  'Подтвердите почту — код в письме. После этого придут бесплатные кредиты': ['Confirm your email — the code is in the message. Free credits arrive after that', 'Konfirmoni email-in — kodi është në mesazh. Pas kësaj vijnë kreditet falas'],
  'Кредиты закончились: смотреть и скачивать можно, создавать новое — после пополнения. Напишите нам — подберём пакет': ['You are out of credits: you can view and download, creating new content needs a top-up. Contact us — we’ll find a package', 'Kreditet mbaruan: mund të shikoni dhe shkarkoni, për të krijuar të reja duhet rimbushje. Na shkruani — gjejmë një paketë'],
  'Слишком много попыток — подождите 15 минут': ['Too many attempts — wait 15 minutes', 'Shumë përpjekje — prisni 15 minuta'],
  'Слишком много регистраций с этого адреса — попробуйте через час': ['Too many sign-ups from this address — try again in an hour', 'Shumë regjistrime nga kjo adresë — provoni pas një ore'],
  'Не хватает кредитов: {} стоит {} {}, осталось {}. Напишите нам — продлим подписку или докупим кредиты': ['Not enough credits: {} costs {} {}, you have {} left. Contact us — we’ll extend the plan or add credits', 'Nuk mjaftojnë kreditet: {} kushton {} {}, ju kanë mbetur {}. Na shkruani — zgjasim planin ose shtojmë kredite'],

  // ——— Оплата ———
  'Оплата — из кабинета компании': ['Payment is made from the company account', 'Pagesa bëhet nga llogaria e kompanisë'],
  'Нет такого способа оплаты': ['No such payment method', 'Nuk ka mënyrë pagese të tillë'],
  'Оплата USDT пока не подключена — напишите нам, подключим вручную': ['USDT payment is not connected yet — contact us and we’ll set it up manually', 'Pagesa me USDT nuk është lidhur ende — na shkruani, e bëjmë manualisht'],
  'У тарифа нет цены — напишите нам': ['This plan has no price — contact us', 'Ky plan nuk ka çmim — na shkruani'],
  'Сумма тарифа слишком мала для оплаты USDT — напишите нам': ['The plan amount is too small for USDT — contact us', 'Shuma e planit është shumë e vogël për USDT — na shkruani'],
  'Этот способ оплаты пока не подключён — напишите нам, подключим вручную': ['This payment method is not connected yet — contact us and we’ll set it up manually', 'Kjo mënyrë pagese nuk është lidhur ende — na shkruani, e bëjmë manualisht'],
  'Оплата временно недоступна — напишите нам, подключим вручную': ['Payment is temporarily unavailable — contact us and we’ll do it manually', 'Pagesa nuk është e disponueshme përkohësisht — na shkruani, e bëjmë manualisht'],
  'Сумма тарифа слишком мала для оплаты — напишите нам': ['The plan amount is too small to pay — contact us', 'Shuma e planit është shumë e vogël për pagesë — na shkruani'],
  'Для оплаты нужна почта в профиле — напишите нам': ['Payment needs an email in your profile — contact us', 'Për pagesë duhet email në profil — na shkruani'],
  'Нет такой оплаты': ['No such payment', 'Nuk ka pagesë të tillë'],

  // ——— Источники машин ———
  'Не нашёл номер машины — нужна ссылка encar.com или номер объявления': ['Couldn’t find the car number — paste an encar.com link or listing number', 'Nuk u gjet numri i makinës — vendosni një lidhje encar.com ose numrin e shpalljes'],
  'Не нашёл номер машины — нужна ссылка che168.com / global.che168.com или номер': ['Couldn’t find the car number — paste a che168.com / global.che168.com link or number', 'Nuk u gjet numri i makinës — vendosni një lidhje che168.com / global.che168.com ose numrin'],
  'Не нашёл номер машины — нужна ссылка carsensor.net/usedcar/detail/… или номер вида AU7375484964': ['Couldn’t find the car number — paste a carsensor.net/usedcar/detail/… link or a number like AU7375484964', 'Nuk u gjet numri i makinës — vendosni një lidhje carsensor.net/usedcar/detail/… ose numër si AU7375484964'],
  'Источник «Корея» не ответил вовремя — попробуйте ещё раз': ['The “Korea” source didn’t respond in time — try again', 'Burimi «Kore» nuk u përgjigj në kohë — provoni përsëri'],
  'Источник «Корея» недоступен — попробуйте чуть позже': ['The “Korea” source is unavailable — try a bit later', 'Burimi «Kore» nuk është i disponueshëm — provoni pak më vonë'],
  'Машина не найдена — возможно, объявление снято': ['Car not found — the listing may have been removed', 'Makina nuk u gjet — shpallja mund të jetë hequr'],
  'Источник «Корея» не принял запрос — мы уже разбираемся': ['The “Korea” source rejected the request — we’re looking into it', 'Burimi «Kore» e refuzoi kërkesën — po e shqyrtojmë'],
  'Источник «Корея» просит притормозить — попробуйте позже': ['The “Korea” source asks to slow down — try later', 'Burimi «Kore» kërkon të ngadalësojmë — provoni më vonë'],
  'Источник «Корея» просит притормозить — попробуйте через минуту': ['The “Korea” source asks to slow down — try in a minute', 'Burimi «Kore» kërkon të ngadalësojmë — provoni pas një minute'],
  'Источник «Корея» временно не отвечает — попробуйте чуть позже': ['The “Korea” source is temporarily not responding — try a bit later', 'Burimi «Kore» përkohësisht nuk përgjigjet — provoni pak më vonë'],
  'Источник «Корея» ответил не карточкой машины': ['The “Korea” source didn’t return a car', 'Burimi «Kore» nuk ktheu një makinë'],
  'Источник «Корея» отдал машину без марки и модели — попробуйте позже': ['The “Korea” source returned a car without make and model — try later', 'Burimi «Kore» ktheu makinë pa markë dhe model — provoni më vonë'],
  'Запрос к источнику «Корея» прерван по общему таймауту': ['The request to the “Korea” source timed out', 'Kërkesa te burimi «Kore» skadoi'],
  'Ответ источника «Корея» оборвался': ['The “Korea” source response was cut off', 'Përgjigjja e burimit «Kore» u ndërpre'],
  'Источник «Корея» ответил пустой страницей — попробуйте чуть позже': ['The “Korea” source returned an empty page — try a bit later', 'Burimi «Kore» ktheu faqe bosh — provoni pak më vonë'],
  'Шлюз kmotors не отвечает': ['The “Korea” source is not responding', 'Burimi «Kore» nuk përgjigjet'],
  'Не удалось разобрать машину из Кореи — сообщите нам, мы поправим': ['Couldn’t read the car from Korea — let us know and we’ll fix it', 'Makina nga Koreja nuk u lexua — na njoftoni dhe e rregullojmë'],
  'Источник «Корея» дал сбой — попробуйте позже': ['The “Korea” source failed — try later', 'Burimi «Kore» dështoi — provoni më vonë'],
  'Не удалось разобрать машину из Китая — сообщите нам, мы поправим': ['Couldn’t read the car from China — let us know and we’ll fix it', 'Makina nga Kina nuk u lexua — na njoftoni dhe e rregullojmë'],
  'Источник «Китай» отдал машину без данных — попробуйте позже или другую ссылку': ['The “China” source returned a car without data — try later or another link', 'Burimi «Kinë» ktheu makinë pa të dhëna — provoni më vonë ose një lidhje tjetër'],
  'Источник «Китай» дал сбой — попробуйте позже': ['The “China” source failed — try later', 'Burimi «Kinë» dështoi — provoni më vonë'],
  'Не удалось разобрать машину из Японии — сообщите нам, мы поправим': ['Couldn’t read the car from Japan — let us know and we’ll fix it', 'Makina nga Japonia nuk u lexua — na njoftoni dhe e rregullojmë'],
  'Источник «Япония» отдал машину без данных — попробуйте позже или другую ссылку': ['The “Japan” source returned a car without data — try later or another link', 'Burimi «Japoni» ktheu makinë pa të dhëna — provoni më vonë ose një lidhje tjetër'],
  'Источник «Япония» дал сбой — попробуйте позже': ['The “Japan” source failed — try later', 'Burimi «Japoni» dështoi — provoni më vonë'],
  'Машины {} нет на che168 — снята с продажи или неверный номер': ['Car {} is not on che168 — sold or wrong number', 'Makina {} nuk është në che168 — e shitur ose numër i gabuar'],
  'Машины с таким номером нет на che168': ['There is no car with this number on che168', 'Nuk ka makinë me këtë numër në che168'],
  'Машины {} нет на Carsensor — объявление снято или номер неверный': ['Car {} is not on Carsensor — listing removed or wrong number', 'Makina {} nuk është në Carsensor — shpallja u hoq ose numër i gabuar'],
  'Машины {} нет на Carsensor — объявление снято': ['Car {} is not on Carsensor — the listing was removed', 'Makina {} nuk është në Carsensor — shpallja u hoq'],
  'che168 не ответил за {} с': ['che168 didn’t respond within {} s', 'che168 nuk u përgjigj brenda {} s'],
  'che168 недоступен (сеть или DNS)': ['che168 is unavailable (network or DNS)', 'che168 nuk është i disponueshëm (rrjet ose DNS)'],
  'che168 просит снизить частоту запросов': ['che168 asks to slow down', 'che168 kërkon të ngadalësojmë'],
  'Carsensor не ответил за {} с': ['Carsensor didn’t respond within {} s', 'Carsensor nuk u përgjigj brenda {} s'],
  'Carsensor недоступен (сеть или DNS)': ['Carsensor is unavailable (network or DNS)', 'Carsensor nuk është i disponueshëm (rrjet ose DNS)'],
  'Carsensor недоступен': ['Carsensor is unavailable', 'Carsensor nuk është i disponueshëm'],
  'Carsensor просит снизить частоту запросов': ['Carsensor asks to slow down', 'Carsensor kërkon të ngadalësojmë'],
  'Ядро перегружено запросами — повторите чуть позже': ['Too many requests right now — try again a bit later', 'Shumë kërkesa tani — provoni pak më vonë'],

  // ——— Объявления, фото, ролики ———
  // Текст поста к карусели (server/carousel.mjs, saveCarouselCaption)
  'Слишком длинный текст поста: до {} знаков': ['The post text is too long: up to {} characters', 'Teksti i postimit është shumë i gjatë: deri në {} karaktere'],
  'Хэштеги — до 5 штук, каждый со знаком # и без пробелов': ['Hashtags: up to 5, each starting with # and without spaces', 'Hashtag-ët: deri në 5, secili me # dhe pa hapësira'],
  'Нет такого объявления': ['No such listing', 'Nuk ka shpallje të tillë'],
  'Ролик этого объявления сейчас собирается — дождитесь или отмените сборку': ['The video for this listing is being built — wait or cancel the build', 'Videoja e kësaj shpalljeje po krijohet — prisni ose anuloni'],
  'Добавь хотя бы одно фото': ['Add at least one photo', 'Shtoni të paktën një foto'],
  'Выберите хотя бы одно фото': ['Select at least one photo', 'Zgjidhni të paktën një foto'],
  'За раз — не больше {} фото': ['No more than {} photos at a time', 'Jo më shumë se {} foto njëherësh'],
  'Добавлять можно только фото из объявления Encar, che168 или Carsensor': ['You can only add photos from an Encar, che168 or Carsensor listing', 'Mund të shtoni vetëm foto nga shpallja Encar, che168 ose Carsensor'],
  'Площадка не отдала фото: {}': ['The site didn’t return the photo: {}', 'Faqja nuk e ktheu foton: {}'],
  'Площадка не отдала фото ({}) — возможно, объявление изменили': ['The site didn’t return the photo ({}) — the listing may have changed', 'Faqja nuk e ktheu foton ({}) — shpallja mund të jetë ndryshuar'],
  'Фото из объявления слишком большое': ['The listing photo is too large', 'Fotoja e shpalljes është shumë e madhe'],
  'Этого фото нет в объявлении': ['This photo is not in the listing', 'Kjo foto nuk është në shpallje'],
  'Это фото лежит вне папки объявления — редактировать его здесь нельзя': ['This photo is outside the listing — it can’t be edited here', 'Kjo foto është jashtë shpalljes — nuk mund të redaktohet këtu'],
  'Не удалось прочитать изображение «{}»': ['Couldn’t read the image “{}”', 'Imazhi «{}» nuk u lexua'],
  'Файл слишком большой для загрузки': ['The file is too large to upload', 'Skedari është shumë i madh për ngarkim'],
  'Запрос пришёл повреждённым — обновите страницу и попробуйте ещё раз': ['The request arrived damaged — refresh the page and try again', 'Kërkesa erdhi e dëmtuar — rifreskoni faqen dhe provoni përsëri'],
  'Не найдено — возможно, это уже удалили. Обновите страницу': ['Not found — it may have been deleted. Refresh the page', 'Nuk u gjet — mund të jetë fshirë. Rifreskoni faqen'],
  'Неизвестный формат «{}»': ['Unknown format “{}”', 'Format i panjohur «{}»'],
  'Курс вона пока недоступен — впишите его вручную': ['The won rate isn’t available yet — enter it manually', 'Kursi i uonit nuk është i disponueshëm — shkruajeni manualisht'],
  'У вас уже {} роликов в очереди — дождитесь, пока часть соберётся': ['You already have {} videos in the queue — wait until some are done', 'Keni tashmë {} video në radhë — prisni derisa disa të përfundojnë'],
  'Завис на шаге «{}»: {} мин без движения, задание снято. Кредиты вернулись — нажмите «Пересобрать»': ['Stuck at step “{}” for {} min, the job was cancelled. Credits were refunded — press “Rebuild”', 'Ngeci te hapi «{}» për {} min, detyra u anulua. Kreditet u kthyen — shtypni «Rikrijo»'],
  'Этот ролик уже не в очереди и не в работе': ['This video is no longer queued or in progress', 'Kjo video nuk është më në radhë ose në punë'],
  'Исходные данные этого ролика уже не в памяти — запусти рендер заново из объявления или обзора': ['This video’s source data is gone — start the build again from the listing', 'Të dhënat e kësaj videoje nuk janë më — nisni krijimin përsëri nga shpallja'],
  'Ролик не собрался, кредиты вернулись. Нажмите «Пересобрать»; повторится — напишите в поддержку': ['The video failed to build, credits were refunded. Press “Rebuild”; if it happens again, contact support', 'Videoja nuk u krijua, kreditet u kthyen. Shtypni «Rikrijo»; nëse përsëritet, shkruani mbështetjes'],
  'Сначала отмени рендер, потом удаляй': ['Cancel the build first, then delete', 'Fillimisht anuloni krijimin, pastaj fshini'],

  // ——— Оформление и бренд ———
  'Выберите дизайн из списка': ['Choose a design from the list', 'Zgjidhni një dizajn nga lista'],
  'Компоновка — основная или альтернативная': ['Layout must be main or alternative', 'Paraqitja duhet të jetë kryesore ose alternative'],
  'Цвет «{}» — в виде #RRGGBB': ['Colour “{}” must be #RRGGBB', 'Ngjyra «{}» duhet të jetë #RRGGBB'],
  'Шрифты ролика — одна из пар в списке': ['Video fonts must be one of the pairs in the list', 'Fontet e videos duhet të jenë një nga çiftet në listë'],
  'Оформление ролика: акцент и углы — из списка': ['Video style: accent and corners must be from the list', 'Stili i videos: theksi dhe këndet duhet të jenë nga lista'],
  'Шрифты — только из Google Fonts': ['Fonts must be from Google Fonts', 'Fontet duhet të jenë nga Google Fonts'],
  'Файл не пришёл': ['No file received', 'Skedari nuk erdhi'],
  'Файл {} МБ — больше {} МБ': ['The file is {} MB — more than {} MB', 'Skedari është {} MB — më shumë se {} MB'],
  'Это не картинка или файл повреждён': ['This is not an image or the file is damaged', 'Ky nuk është imazh ose skedari është i dëmtuar'],
  'Нужен PNG, JPG, WebP или SVG, а это {}': ['PNG, JPG, WebP or SVG is needed, but this is {}', 'Duhet PNG, JPG, WebP ose SVG, por ky është {}'],
  'Сначала загрузите логотип': ['Upload a logo first', 'Fillimisht ngarkoni logon'],
  'Сначала загрузите иконку': ['Upload an icon first', 'Fillimisht ngarkoni ikonën'],

  // ——— Карусели ———
  'Нет такого стиля карусели: {}': ['No such carousel style: {}', 'Nuk ka stil karuseli të tillë: {}'],
  'Стиль «{}» пока не собирается в этом формате — выберите другой формат или «Как в бренде»': ['The “{}” style isn’t available in this format yet — choose another format or “As brand”', 'Stili «{}» nuk krijohet ende në këtë format — zgjidhni një format tjetër ose «Si te marka»'],
  'Нет такого формата карусели: {}': ['No such carousel format: {}', 'Nuk ka format karuseli të tillë: {}'],
  'Не удалось скачать фото машины — площадка не отдаёт их с сервера. Попробуйте позже': ['Couldn’t download the car photos — the site doesn’t serve them to our server. Try later', 'Fotot e makinës nuk u shkarkuan — faqja nuk ia jep serverit. Provoni më vonë'],
  'Эта карусель уже собирается': ['This carousel is already being built', 'Ky karusel po krijohet tashmë'],
  'У этого объявления нет фото — карусель по нему не собрать': ['This listing has no photos — a carousel can’t be built', 'Kjo shpallje nuk ka foto — karuseli nuk mund të krijohet'],
  'Карусель не найдена — соберите её по ссылке': ['Carousel not found — build it from the link', 'Karuseli nuk u gjet — krijojeni nga lidhja'],
  'Карусель не собрана': ['The carousel hasn’t been built', 'Karuseli nuk është krijuar'],
  'Нет такого слайда': ['No such slide', 'Nuk ka slajd të tillë'],
  'Цена — положительное число': ['The price must be a positive number', 'Çmimi duhet të jetë numër pozitiv'],
  'Эту карусель собрали до правки текста — нажмите «Пересобрать», и текст можно будет менять': ['This carousel was built before text editing existed — press “Rebuild” to edit the text', 'Ky karusel u krijua para redaktimit të tekstit — shtypni «Rikrijo» për ta ndryshuar tekstin'],
  'В этой карусели нет такого слайда': ['This carousel has no such slide', 'Ky karusel nuk ka slajd të tillë'],
  'Нет текстов для слайда': ['No texts for this slide', 'Nuk ka tekste për këtë slajd'],
  'У этого слайда нет поля «{}»': ['This slide has no “{}” field', 'Ky slajd nuk ka fushën «{}»'],
  'Текст — строкой': ['The text must be a string', 'Teksti duhet të jetë varg'],
  'Слишком длинный текст: до {} знаков, иначе он не поместится на слайд': ['The text is too long: up to {} characters, otherwise it won’t fit on the slide', 'Teksti është shumë i gjatë: deri në {} karaktere, përndryshe nuk hyn në slajd'],
  'Эта карусель сейчас собирается — дождись': ['This carousel is being built — please wait', 'Ky karusel po krijohet — prisni'],

  // ——— Общий ответ ———
  'Внутренняя ошибка сервера. Код для поддержки: {}': ['Internal server error. Support code: {}', 'Gabim i brendshëm i serverit. Kodi për mbështetjen: {}'],
};

const LANG_INDEX = {en: 0, sq: 1};

// Русские слова, которые попадают в шаблон подстановкой (billing.mjs: «ролик стоит 1 кредит»)
const WORDS = {
  'ролик': ['a video', 'një video'], 'карусель': ['a carousel', 'një karusel'], 'обзор': ['a review', 'një rishikim'],
  'кредит': ['credit', 'kredit'], 'кредита': ['credits', 'kredite'], 'кредитов': ['credits', 'kredite'],
};
const word = (v, i) => WORDS[v]?.[i] ?? v;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Ключи с {} — шаблоны: «Письмо уже отправлено — повторить можно через {} с» узнаёт любое число
const PATTERNS = Object.entries(DICT).filter(([k]) => k.includes('{}')).map(([k, v]) => ({
  re: new RegExp(`^${k.split('{}').map(escapeRe).join('([\\s\\S]*?)')}$`), v,
}));

/** Язык запроса из заголовка X-Lang (его шлёт интерфейс); не наш — русский */
export const requestLang = (req) => {
  const l = String(req?.get?.('x-lang') ?? '').toLowerCase();
  return l === 'en' || l === 'sq' ? l : 'ru';
};

/** Текст ошибки на языке клиента; нет перевода — как есть (по-русски) */
export const translateError = (message, lang) => {
  const i = LANG_INDEX[lang];
  if (i === undefined || typeof message !== 'string') return message;
  const exact = DICT[message];
  if (exact) return exact[i];
  for (const {re, v} of PATTERNS) {
    const m = re.exec(message);
    if (m) {
      let n = 1;
      return v[i].replace(/\{\}/g, () => word(m[n++] ?? '', i));
    }
  }
  return message;
};

/** Для проверки словаря (tools/i18n-errors.mjs) */
export const ERROR_KEYS = Object.keys(DICT);
