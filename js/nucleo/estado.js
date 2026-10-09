// Estado compartilhado entre módulos.
// ES modules não permitem reatribuir uma variável importada; estas 13 variáveis
// eram reatribuídas em mais de um arquivo, então vivem aqui como propriedades.
// Leia/escreva sempre como estadoApp.nome
//   chaves: analisesChartInstances, analisesDataAtual, analisesEquipes, analisesProfissional, analisesProfissionalMs, analisesQuads, currentEquipes, currentRecordId, latestSheets, memoryHistory, officialOverrides, quadsSelecionados, refMonthDates
export const estadoApp = {};
