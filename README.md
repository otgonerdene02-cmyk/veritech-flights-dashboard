# Veritech Flights Dashboard

MRTD Veritech API (`kpiIndicatorDataList`)-с өдөр тутам нислэгийн өгөгдлийг татаж
`docs/flights-YYYY.json` (жил бvрээр тусад нь) болгон commit хийдэг GitHub Actions
workflow, мөн тэр өгөгдлийг харуулах GitHub Pages dashboard (`docs/index.html`).

## Бүтэц

```
.github/workflows/fetch-flights.yml   өдөр тутам ажилладаг Action
scripts/fetchFlights.js               API-г дуудаж, mapVeritechRow-оор хувиргаад бичдэг
scripts/mapVeritechRow.js             мөр бүрийг dashboard-д ээлтэй хэлбэрт хувиргадаг
scripts/ontology.js                   data/ontology/*.json-г ашиглаж region/continent/
                                       alliance/category баганыг flight мөр бvрт шингээдэг
scripts/applyOntology.js              одоо байгаа docs/flights-YYYY.json файлvvдыг
                                       ontology-гоор дахин баяжуулах (API дуудахгvй,
                                       `npm run apply-ontology`)
data/ontology/city-country-region.json  хот -> улс/бvс нутаг/тив/alias лавлах хvснэгт
data/ontology/airline-alliance.json      тээвэрлэгч -> альянс/харьяа улс лавлах хvснэгт
data/ontology/aircraft-category.json     онгоцны загвар -> vйлдвэрлэгч/ангилал/суудал,
                                       БОЛОН бvртгэлийн код -> БVРТГЭЛИЙН улс (чиглэлийн
                                       улстай ХОЛИХГVЙ) лавлах хvснэгт
docs/index.html                       GitHub Pages dashboard (статик, эхлээд
                                       flights-index.json-оос жилvvдийг олж, тухайн
                                       жилийн flights-YYYY.json-г fetch хийдэг)
docs/flights-index.json               ямар жилvvд бэлэн байгааг (жил, мөрийн тоо,
                                       fetchedAt) жагсаасан жижиг индекс файл
docs/flights-YYYY.json                Action-аар автоматаар шинэчлэгддэг тухайн жилийн
                                       өгөгдөл (region/continent/alliance/category
                                       багануудтай)
```

`docs/index.html` нь дэлхийн газрын зургийн визуалчлалд [ECharts](https://echarts.apache.org/)-г
CDN-ээс (`cdn.jsdelivr.net`) ачаалдаг, мөн газрын зургийн GeoJSON-г
`raw.githubusercontent.com/apache/echarts`-с fetch хийдэг тул эдгээр хаягууд хориглогдоогүй
сүлжээнд л бүрэн ажиллана.

## Тохируулга (нэг удаа)

1. GitHub дээр хоосон repo үүсгэ (жишээ нь `veritech-flights-dashboard`), README/gitignore
   нэмэлгүйгээр (эдгээр нь энэ фолдерт аль хэдийн бий).

2. Энэ фолдерыг git repo болгоод remote-оо холбоно:

   ```
   git init
   git add .
   git commit -m "Initial commit: Veritech flights fetcher + dashboard"
   git branch -M main
   git remote add origin https://github.com/<таны-account>/veritech-flights-dashboard.git
   git push -u origin main
   ```

3. Repo Settings → Secrets and variables → Actions руу орж дараах **secret**-үүдийг нэм:
   - `MRTD_USERNAME`
   - `MRTD_PASSWORD`

   Мөн (сонголтоор) **variable** нэмж болно:
   - `MRTD_INDICATOR_ID` — өгөхгүй бол `14995832` default утга ашиглана.

   > Нэвтрэх мэдээллийг эх кодод бичихгүйгээр зөвхон secret-ээр дамжуулна.

4. Repo Settings → Pages руу орж:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/docs**
   - Save

   Хэдэн минутын дараа dashboard `https://<таны-account>.github.io/veritech-flights-dashboard/`
   хаягаар нээгдэнэ.

5. Workflow-г шууд турших бол repo-ийн **Actions → Fetch Veritech Flights → Run workflow**
   товч дээр дар (эсвэл 20 минут хүлээвэл өөрөө автоматаар ажиллана).

## API-ийн талаар нэг чухал зүйл

`kpiIndicatorDataList` команд offset/pageSize-ийг `parameters` дор шууд бус
`parameters.paging.{offset,pageSize}` дэд объект дотор шаарддаг — эдгээрийг буруу
байрлуулбал сервер параметрүүдийг үл тоож дефолт (сүүлийн ~50 мөр) хариу буцаадаг
байсан нь (2026-08-01) тогтоогдож зассан. `offset` нь 1-ээс эхэлдэг хуудасны
дугаар; `fetchFlights.js` нь `offset=1`-ээс эхлэн, буцаж ирсэн мөрийн тоо
`totalcount`-д хүрэх (эсвэл хоосон хуудас ирэх) хүртэл дараалан дуудаж, **бүх
мөрийг run бүрд бүрэн дахин татдаг**.

Иймээс `docs/flights.json`-г run бүрд **бүхэлд нь дахин бичдэг (overwrite)** —
энэ нь дата алдахгүй, учир нь бичихээсээ өмнө бүх датаг дахин бүрэн татсан байдаг.
Хуучин файлтай ID/Unixtimestamp-аар харьцуулах логик зөвхөн лог дээр шинэ/
шинэчлэгдсэн/өөрчлөгдөөгүй мөрийн тоог хэвлэхэд ашиглагддаг статистик бөгөөд
бичигдэх эцсийн жагсаалтад нөлөөгүй. `RETENTION_DAYS`-тэй холбоотой хуучин
хуримтлал/цэвэрлэгээний механизм бүрэн хасагдсан — учир нь хуримтлуулах
шаардлагагүй, эх сурвалж run бүрдээ бүх түүхээ буцаадаг.

> **Мэдэгдэж буй хязгаарлалт:** `indicatorId=14995832` эх сурвалж (мөн MRTD
> платформоос гараар татсан Excel экспорт) өнөөдрийг хүртэл зөвхөн **2026 оны**
> дата агуулж байгааг ажигласан (2026-08-01 шалгалт: paginate хийж бүх 11,979
> мөрийг татсан ч бүгд 2026 он). Энэ бол скриптийн алдаа биш — эх сурвалжид
> өмнөх жилүүдийн бичлэг байхгүй буюу тусдаа indicator ID шаардаж магадгүй.
> Хуучин жилүүдийн дата хэрэгтэй бол MRTD-с тусдаа indicator/тайлан байгаа
> эсэхийг шалгах хэрэгтэй.

## Локал тест

Нэвтрэх мэдээллийг эх кодод/README-д plaintext-ээр бичихгvй, локал `.env`-д хадгал
(`.gitignore`-д аль хэдийн `.env.local` орсон байгаа):

```
# .env.local (commit хийгдэхгvй)
MRTD_USERNAME=<таны хэрэглэгчийн нэр>
MRTD_PASSWORD=<таны нууц vг>
```

Дараа нь тухайн орчны хувьсагчаар ачаалж ажиллуул:

```
$env:MRTD_USERNAME=(Get-Content .env.local | Select-String MRTD_USERNAME).ToString().Split('=')[1]
$env:MRTD_PASSWORD=(Get-Content .env.local | Select-String MRTD_PASSWORD).ToString().Split('=')[1]
node scripts/fetchFlights.js
```

Ажилласны дараа `docs/flights.json`-г шинэчилнэ; үүнийг `docs/index.html`-тэй хамт
локал static server-ээр (`npx serve docs` гм) нээж шалгаж болно.

> **Аюулгvй байдал:** Git түvхэнд өмнө нь турших (`v_integration`) бодит нэвтрэх
> мэдээлэл plaintext-ээр commit хийгдэж байсан. Хэрэв энэ эрх одоо ч идэвхтэй бол
> API нэвтрэх vгийг эргvvлж (rotate) солихыг зөвлөж байна — README-ээс устгасан ч
> хуучин commit-vvдэд vлдсэн хэвээр.

## Style/font өөрчлөлт хийх vед

Хvснэгт, KPI карт зэрэг элементvvдийн font-size/line-height/height-той холбоотой
CSS засвар хийх бvрт **заавал** дараах тестийг ажиллуулж, элементvvд хоорондоо
давхцаж (overlap) эсвэл overflow болоогvйг баталгаажуул:

```
npm run test:visual
```

Энэ нь:
- `tests/visual.spec.js` — dashboard-ын гол хэсгvvдийн screenshot-ыг baseline-тай
  харьцуулна (`maxDiffPixelRatio: 0.01`)
- `tests/overlap.spec.js` — KPI карт, задаргааны хvснэгт (тээвэрлэгч/улс), нислэгийн
  жагсаалтын хvснэгтийн чухал элементvvд (тоон утга vs толгой мөр гэх мэт) хоорондын
  bounding rect давхцаж байгаа эсэхийг автоматаар шалгана

Санаатайгаар дизайн өөрчилсний дараа screenshot baseline-г шинэчлэх бол:

```
npm run test:visual:update
```

CI дээр `docs/index.html` эсвэл `tests/**`-д өөрчлөлт орох бvрд
(`.github/workflows/visual-tests.yml`) энэ тестvvд автоматаар ажиллаж, davхцал/
overflow илэрвэл PR/push-ыг FAIL болгоно. Linux (ubuntu-latest) CI-д зориулсан
baseline screenshot-г эхний удаа vvсгэх/шинэчлэх бол **Actions → Update Visual
Baselines → Run workflow** товч дээр дар.
