<template>
  <v-container class="about-container" style="max-width:700px;">
    <v-row>
      <v-col>
        <h1 class="about-title" style="text-align:center;">About Collection Manager</h1>
        <v-card class="about-card mb-6" elevation="2">
          <v-card-text>
            <p class="about-paragraph">
              <strong>Collection Manager</strong> is a specialized software tool developed for the
              <a href="https://pvnh.net/plants-and-people-of-vanuatu/" target="_blank" rel="noopener" class="about-link">
                Plans mo Pipol of Vanuatu
              </a>
              project, supporting the management and curation of botanical specimen collections and related data.
            </p>
            <p class="about-paragraph">
              The project aims to document and preserve the rich plant heritage and traditional knowledge of the people of Vanuatu.
            </p>
            <p class="about-paragraph">
              <strong>Developed by:</strong><br>
              Dominik M. Ramík
              <a href="https://dominicweb.eu" target="_blank" rel="noopener" class="about-link" style="margin-left:0.5em;">
                dominicweb.eu
              </a>
            </p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.about-container {
  margin-top: 3em;
  margin-bottom: 3em;
  max-width: 700px;
}
.about-title {
  font-size: 2.2em;
  font-weight: 700;
  margin-bottom: 1.2em;
  letter-spacing: -0.5px;
  color: #2e3a4d;
  text-align: center;
}
.about-card {
  max-width: 520px;
  margin-left: auto;
  margin-right: auto;
  padding: 0.5em 0.5em 0.5em 0.5em;
}
.about-card-title {
  font-size: 1.25em;
  font-weight: 600;
  color: var(--v-theme-secondary);
  letter-spacing: 0.2px;
  padding-bottom: 0.2em;
}
.about-paragraph {
  font-size: 1.18em; /* increased for readability */
  line-height: 1.7;
  color: #333;
  margin-bottom: 1.1em;
}
.about-link {
  color: var(--v-theme-secondary);
  text-decoration: underline;
  font-weight: 500;
}
.about-list {
  margin-left: 1.5em;
  margin-bottom: 1em;
  font-size: 1.12em; /* increased for readability */
  color: #444;
}
</style>
