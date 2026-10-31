GitHub Pages(sin0nis.github.io/hots-scrap)에 이 폴더만 내보내면 옛 주소가 같은 경로의 hotscrap.com 으로 넘어간다.
index.html 과 404.html 은 같은 파일이다(404.html 이 없는 경로 전부를 받는다).
`.github/workflows/pages.yml` 의 `REDIRECT_ONLY` 를 켜면 이 폴더를 배포한다.
