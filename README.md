# Veritech Flights Dashboard

MRTD Veritech API (`kpiIndicatorDataList`)-с 20 минут тутам нислэгийн өгөгдлийг татаж
`docs/flights.json` болгон commit хийдэг GitHub Actions workflow, мөн тэр өгөгдлийг
харуулах GitHub Pages dashboard (`docs/index.html`).

## Бүтэц

```
.github/workflows/fetch-flights.yml   20 минут тутам ажилладаг Action
scripts/fetchFlights.js               API-г дуудаж, mapVeritechRow-оор хувиргаад бичдэг
scripts/mapVeritechRow.js             мөр бүрийг dashboard-д ээлтэй хэлбэрт хувиргадаг
scripts/city_country_map.js           хот -> улс лавлах хүснэгт
docs/index.html                       GitHub Pages dashboard (статик, зөвхон fetch('./flights.json'))
docs/flights.json                     Action-аар автоматаар шинэчлэгддэг өгөгдөл
```

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

`kpiIndicatorDataList` команд `offset`/`pageSize`/`page` параметрүүдийг үл харгалзан
үргэлж хамгийн сүүлийн ~50 бичлэгийг л буцаадаг нь турших явцад тогтоогдсон (нийт
бичлэгийн тоо `paging.totalcount` талбарт ажиглагдсан ч энэ endpoint-оор бүгдийг нь
татаж авах боломжгүй). Тиймээс `fetchFlights.js` нь `docs/flights.json`-г **дарж
бичихийн оронд ID-аар нэгтгэж (merge/dedupe)** хадгалдаг — ингэснээр 20 минут тутамд
ажиллах үед сүүлийн 50 мөрөнд орсон шинэ бичлэгүүд хуримтлагдаж, dashboard дээрх
өдөр тутмын трэнд цаг хугацааны хувьд утга учиртай болно. Хуримтлагдсан файл хэт том
болохоос сэргийлж `RETENTION_DAYS` (default 180 хоног, `FLIGHTS_RETENTION_DAYS` орчны
хувьсагчаар өөрчилж болно) болон 20,000 бичлэгийн дээд хязгаараар цэвэрлэдэг.

## Локал тест

```
$env:MRTD_USERNAME="v_integration"
$env:MRTD_PASSWORD="@Integr@ti0n@123"
node scripts/fetchFlights.js
```

Ажилласны дараа `docs/flights.json`-г шинэчилнэ; үүнийг `docs/index.html`-тэй хамт
локал static server-ээр (`npx serve docs` гм) нээж шалгаж болно.
