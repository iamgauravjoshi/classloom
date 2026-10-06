# Embedded report-card fonts

Noto Sans Regular and Noto Sans Devanagari Regular come from the official [Noto fonts repository](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf). Both are distributed under the SIL Open Font License 1.1; see OFL.txt. The API embeds the font programs in PDF downloads and copies these assets into its production build. Font coverage is checked before rendering; unsupported characters are preserved as Unicode code-point notation, with the online report retaining the original text.
