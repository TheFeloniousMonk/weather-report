/**
 * Weather Report Dashboard - Renderer
 * 
 * Handles data visualization, file management, and UI interactions.
 */

// ============================================================
// State Management
// ============================================================

const state = {
  csvPath: null,
  pythonPath: null,
  selectedMarkdownPath: null,
  data: [],
  filteredData: [],
  currentView: 'summary', // 'summary' or 'detail'
  
  // Filter state
  sessionCount: 25,
  selectedDimension: 'all',
  selectedSystemState: 'all',
  
  // Legend state (for toggling lines)
  hiddenDimensions: new Set(),
};

const DIMENSIONS = [
  { key: 'conflict', label: 'Conflict', questions: [1, 2, 3, 4, 5], color: '#ef4444' },
  { key: 'edge_case', label: 'Edge Case', questions: [6, 7, 8, 9, 10], color: '#f97316' },
  { key: 'tone', label: 'Tone', questions: [11, 12, 13, 14, 15], color: '#eab308' },
  { key: 'filtering', label: 'Filtering', questions: [16, 17, 18, 19, 20], color: '#22c55e' },
  { key: 'deployment', label: 'Deployment', questions: [21, 22, 23, 24, 25], color: '#14b8a6' },
  { key: 'metacognition', label: 'Metacognition', questions: [26, 27, 28], color: '#3b82f6' },
  { key: 'elasticity', label: 'Elasticity', questions: [29, 30], color: '#8b5cf6' },
  { key: 'privacy_safety', label: 'Privacy/Safety', questions: [31, 32], color: '#ec4899' },
  { key: 'architecture', label: 'Architecture', questions: [33, 34, 35], color: '#6366f1' },
];

// ============================================================
// Color Scale - Temperature Gradient
// ============================================================

function getTemperatureColor(value) {
  const stops = [
    { pct: 0,   r: 30,  g: 64,  b: 175 },
    { pct: 40,  r: 59,  g: 130, b: 246 },
    { pct: 50,  r: 147, g: 197, b: 253 },
    { pct: 60,  r: 248, g: 250, b: 252 },
    { pct: 70,  r: 252, g: 165, b: 165 },
    { pct: 80,  r: 239, g: 68,  b: 68  },
    { pct: 100, r: 153, g: 27,  b: 27  },
  ];

  value = Math.max(0, Math.min(100, value));

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].pct && value <= stops[i + 1].pct) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.pct - lower.pct;
  const rangePct = range === 0 ? 0 : (value - lower.pct) / range;
  
  const r = Math.round(lower.r + (upper.r - lower.r) * rangePct);
  const g = Math.round(lower.g + (upper.g - lower.g) * rangePct);
  const b = Math.round(lower.b + (upper.b - lower.b) * rangePct);

  return `rgb(${r}, ${g}, ${b})`;
}

function getContrastColor(value) {
  if (value >= 45 && value <= 75) {
    return '#1a1a2e';
  }
  return '#f8fafc';
}

function getQuestionColor(score) {
  const pct = ((score - 1) / 4) * 100;
  return getTemperatureColor(pct);
}

// ============================================================
// Data Processing
// ============================================================

async function loadCSVData(csvPath) {
  try {
    const result = await window.api.readCSV(csvPath);
    if (!result.success) {
      console.error('Failed to read CSV:', result.error);
      return [];
    }

    const parsed = Papa.parse(result.content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    return parsed.data;
  } catch (error) {
    console.error('Error loading CSV:', error);
    return [];
  }
}

function getFilteredData() {
  let data = [...state.data];
  
  // Filter by system state
  if (state.selectedSystemState !== 'all') {
    data = data.filter(d => truncateState(d.system_state) === state.selectedSystemState);
  }
  
  // Apply session count limit (from the end, most recent)
  if (state.sessionCount !== 'all' && data.length > state.sessionCount) {
    data = data.slice(-state.sessionCount);
  }
  
  return data;
}

function getUniqueSystemStates() {
  const states = new Set();
  state.data.forEach(d => {
    if (d.system_state) {
      states.add(truncateState(d.system_state));
    }
  });
  return Array.from(states).sort();
}

function calculateDelta(current, previous) {
  if (previous === undefined || previous === null) return null;
  return current - previous;
}

function formatDelta(delta) {
  if (delta === null) return '';
  if (delta === 0) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}%`;
}

function getDeltaClass(delta) {
  if (delta === null || delta === 0) return 'neutral';
  return delta > 0 ? 'positive' : 'negative';
}

function formatSessionDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, , month, day] = match;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
  }
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncateState(stateStr) {
  if (!stateStr) return '';
  const match = stateStr.match(/^([^(]+)/);
  return match ? match[1].trim() : stateStr.substring(0, 15);
}

// ============================================================
// Trend Chart Visualization
// ============================================================

function renderTrendChart(data) {
  const container = document.getElementById('trendChartContainer');
  const svg = d3.select('#trendChart');
  svg.selectAll('*').remove();

  if (data.length === 0) {
    document.getElementById('trendEmptyState').style.display = 'block';
    container.style.display = 'none';
    return;
  }

  document.getElementById('trendEmptyState').style.display = 'none';
  container.style.display = 'block';

  const margin = { top: 20, right: 30, bottom: 40, left: 50 };
  const containerEl = document.querySelector('.trend-chart-container');
  const width = containerEl.clientWidth - margin.left - margin.right;
  const height = containerEl.clientHeight - margin.top - margin.bottom;

  const g = svg
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // X Scale - sessions
  const xScale = d3.scaleLinear()
    .domain([0, data.length - 1])
    .range([0, width]);

  // Y Scale - percentage
  const yScale = d3.scaleLinear()
    .domain([0, 100])
    .range([height, 0]);

  // Grid lines
  g.append('g')
    .attr('class', 'grid')
    .selectAll('line')
    .data([20, 40, 60, 80])
    .enter()
    .append('line')
    .attr('x1', 0)
    .attr('x2', width)
    .attr('y1', d => yScale(d))
    .attr('y2', d => yScale(d));

  // Baseline band (60-70%)
  g.append('rect')
    .attr('class', 'baseline-band')
    .attr('x', 0)
    .attr('y', yScale(70))
    .attr('width', width)
    .attr('height', yScale(60) - yScale(70));

  // X Axis
  const xAxisTicks = Math.min(data.length, 10);
  const xAxis = d3.axisBottom(xScale)
    .ticks(xAxisTicks)
    .tickFormat(i => {
      const idx = Math.round(i);
      if (idx >= 0 && idx < data.length) {
        return formatSessionDate(data[idx].date);
      }
      return '';
    });

  g.append('g')
    .attr('class', 'axis x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis);

  // Y Axis
  g.append('g')
    .attr('class', 'axis y-axis')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d + '%'));

  // Determine what to render based on dimension filter
  if (state.selectedDimension === 'all') {
    // Render all dimension lines
    renderDimensionLines(g, data, xScale, yScale);
  } else {
    // Render individual questions for selected dimension
    renderQuestionLines(g, data, xScale, yScale);
  }

  // Update legend
  renderDimensionLegend();
}

function renderDimensionLines(g, data, xScale, yScale) {
  const line = d3.line()
    .x((d, i) => xScale(i))
    .y(d => yScale(d))
    .curve(d3.curveMonotoneX);

  DIMENSIONS.forEach(dim => {
    const values = data.map(session => session[`${dim.key}_pct`]);
    const isHidden = state.hiddenDimensions.has(dim.key);

    // Line
    g.append('path')
      .datum(values)
      .attr('class', `trend-line ${isHidden ? 'dimmed' : ''}`)
      .attr('d', line)
      .attr('stroke', dim.color)
      .attr('data-dimension', dim.key);

    // Dots
    if (!isHidden) {
      g.selectAll(`.dot-${dim.key}`)
        .data(values)
        .enter()
        .append('circle')
        .attr('class', 'trend-dot')
        .attr('cx', (d, i) => xScale(i))
        .attr('cy', d => yScale(d))
        .attr('r', 4)
        .attr('fill', dim.color)
        .attr('data-dimension', dim.key)
        .on('mouseenter', function(event, d) {
          const i = values.indexOf(d);
          showTrendTooltip(event, dim.label, d, data[i]);
        })
        .on('mouseleave', hideTooltip);
    }
  });
}

function renderQuestionLines(g, data, xScale, yScale) {
  const dim = DIMENSIONS.find(d => d.key === state.selectedDimension);
  if (!dim) return;

  const line = d3.line()
    .x((d, i) => xScale(i))
    .y(d => yScale(d))
    .curve(d3.curveMonotoneX);

  // Generate colors for questions within dimension
  const colorScale = d3.scaleOrdinal()
    .domain(dim.questions)
    .range(d3.schemeTableau10);

  dim.questions.forEach((qNum, qIdx) => {
    const qKey = `q${String(qNum).padStart(2, '0')}`;
    // Convert 1-5 score to percentage for display
    const values = data.map(session => ((session[qKey] - 1) / 4) * 100);
    const qColor = colorScale(qNum);

    // Line
    g.append('path')
      .datum(values)
      .attr('class', 'trend-line')
      .attr('d', line)
      .attr('stroke', qColor)
      .attr('data-question', qKey);

    // Dots
    g.selectAll(`.dot-${qKey}`)
      .data(values)
      .enter()
      .append('circle')
      .attr('class', 'trend-dot')
      .attr('cx', (d, i) => xScale(i))
      .attr('cy', d => yScale(d))
      .attr('r', 4)
      .attr('fill', qColor)
      .attr('data-question', qKey)
      .on('mouseenter', function(event, d) {
        const i = values.indexOf(d);
        const rawScore = data[i][qKey];
        showTrendTooltip(event, `Q${String(qNum).padStart(2, '0')}`, rawScore, data[i], true);
      })
      .on('mouseleave', hideTooltip);
  });

  // Update legend to show questions instead of dimensions
  renderQuestionLegend(dim);
}

function renderDimensionLegend() {
  const container = document.getElementById('dimensionLegend');
  container.innerHTML = '';

  DIMENSIONS.forEach(dim => {
    const item = document.createElement('div');
    item.className = `legend-item ${state.hiddenDimensions.has(dim.key) ? 'dimmed' : ''}`;
    item.innerHTML = `
      <div class="legend-color" style="background: ${dim.color}"></div>
      <span class="legend-label">${dim.label}</span>
    `;
    item.addEventListener('click', () => toggleDimension(dim.key));
    container.appendChild(item);
  });
}

function renderQuestionLegend(dim) {
  const container = document.getElementById('dimensionLegend');
  container.innerHTML = '';

  const colorScale = d3.scaleOrdinal()
    .domain(dim.questions)
    .range(d3.schemeTableau10);

  dim.questions.forEach(qNum => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-color" style="background: ${colorScale(qNum)}"></div>
      <span class="legend-label">Q${String(qNum).padStart(2, '0')}</span>
    `;
    container.appendChild(item);
  });
}

function toggleDimension(dimKey) {
  if (state.hiddenDimensions.has(dimKey)) {
    state.hiddenDimensions.delete(dimKey);
  } else {
    state.hiddenDimensions.add(dimKey);
  }
  renderTrendChart(state.filteredData);
}

function showTrendTooltip(event, label, value, session, isQuestion = false) {
  tooltipTitle.textContent = label;
  if (isQuestion) {
    tooltipValue.innerHTML = `Score: ${value}<br><span style="color: var(--text-muted); font-size: 11px;">${formatSessionDate(session.date)} · ${truncateState(session.system_state)}</span>`;
  } else {
    tooltipValue.innerHTML = `${value}%<br><span style="color: var(--text-muted); font-size: 11px;">${formatSessionDate(session.date)} · ${truncateState(session.system_state)}</span>`;
  }
  
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY - 12}px`;
  tooltip.classList.add('visible');
}

// ============================================================
// Visualization - Summary Heatmap (Scrollable)
// ============================================================

function renderSummaryHeatmap(data) {
  const container = document.getElementById('summaryHeatmap');
  const wrapper = document.getElementById('summaryHeatmapWrapper');
  
  container.innerHTML = '';

  if (data.length === 0) return;

  // Create table
  const table = document.createElement('table');
  table.className = 'heatmap-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Empty corner cell (label column header)
  const cornerCell = document.createElement('th');
  cornerCell.className = 'heatmap-label';
  headerRow.appendChild(cornerCell);

  // Session headers
  data.forEach((session) => {
    const th = document.createElement('th');
    th.className = 'session-header-cell';
    th.innerHTML = `
      <div class="session-header-inner">
        <div class="session-date">${formatSessionDate(session.date)}</div>
        <div class="session-state">${truncateState(session.system_state)}</div>
        <div class="session-total">${session.total_pct}%</div>
      </div>
    `;
    th.addEventListener('click', () => openDetailPanel(session));
    th.style.cursor = 'pointer';
    headerRow.appendChild(th);
  });

  // Sparkline header spacer
  const sparklineHeader = document.createElement('th');
  sparklineHeader.className = 'sparkline-cell';
  headerRow.appendChild(sparklineHeader);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Data rows
  const tbody = document.createElement('tbody');

  DIMENSIONS.forEach(dim => {
    const row = document.createElement('tr');

    // Label cell
    const labelCell = document.createElement('th');
    labelCell.className = 'heatmap-label';
    labelCell.textContent = dim.label;
    row.appendChild(labelCell);

    // Data cells
    const values = [];
    data.forEach((session, idx) => {
      const pctKey = `${dim.key}_pct`;
      const value = session[pctKey];
      values.push(value);

      const prevValue = idx > 0 ? data[idx - 1][pctKey] : null;
      const delta = calculateDelta(value, prevValue);

      const td = document.createElement('td');
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.style.backgroundColor = getTemperatureColor(value);
      cell.style.color = getContrastColor(value);
      cell.textContent = `${value}%`;

      if (delta !== null && delta !== 0) {
        const deltaSpan = document.createElement('span');
        deltaSpan.className = `delta ${getDeltaClass(delta)}`;
        deltaSpan.textContent = formatDelta(delta);
        cell.appendChild(deltaSpan);
      }

      cell.addEventListener('mouseenter', (e) => showTooltip(e, dim.label, value, session));
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('click', () => openDetailPanel(session, dim.key));

      td.appendChild(cell);
      row.appendChild(td);
    });

    // Sparkline cell
    const sparklineTd = document.createElement('td');
    sparklineTd.className = 'sparkline-cell';
    const sparklineContainer = document.createElement('div');
    sparklineContainer.className = 'sparkline-container';
    renderSparkline(sparklineContainer, values);
    sparklineTd.appendChild(sparklineContainer);
    row.appendChild(sparklineTd);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  // Scroll to the right (most recent data)
  requestAnimationFrame(() => {
    wrapper.scrollLeft = wrapper.scrollWidth;
  });
}

// ============================================================
// Visualization - Detail Heatmap (Individual Questions)
// ============================================================

function renderDetailHeatmap(data) {
  const container = document.getElementById('detailHeatmap');
  const wrapper = document.getElementById('detailHeatmapWrapper');
  
  container.innerHTML = '';

  if (data.length === 0) return;

  // Create table
  const table = document.createElement('table');
  table.className = 'heatmap-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Empty corner cell
  const cornerCell = document.createElement('th');
  cornerCell.className = 'heatmap-label';
  headerRow.appendChild(cornerCell);

  // Session headers
  data.forEach((session) => {
    const th = document.createElement('th');
    th.className = 'session-header-cell';
    th.innerHTML = `
      <div class="session-header-inner">
        <div class="session-date">${formatSessionDate(session.date)}</div>
        <div class="session-state">${truncateState(session.system_state)}</div>
      </div>
    `;
    th.addEventListener('click', () => openDetailPanel(session));
    th.style.cursor = 'pointer';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Data rows grouped by dimension
  const tbody = document.createElement('tbody');

  DIMENSIONS.forEach(dim => {
    // Dimension header row
    const dimRow = document.createElement('tr');
    const dimLabel = document.createElement('th');
    dimLabel.className = 'heatmap-label dimension-header';
    dimLabel.textContent = dim.label;
    dimLabel.colSpan = data.length + 1;
    dimRow.appendChild(dimLabel);
    tbody.appendChild(dimRow);

    // Question rows
    dim.questions.forEach(qNum => {
      const row = document.createElement('tr');

      // Question label
      const labelCell = document.createElement('th');
      labelCell.className = 'heatmap-label question-label';
      labelCell.textContent = `Q${String(qNum).padStart(2, '0')}`;
      row.appendChild(labelCell);

      // Score cells
      data.forEach((session) => {
        const qKey = `q${String(qNum).padStart(2, '0')}`;
        const score = session[qKey];

        const td = document.createElement('td');
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell question-cell';
        cell.style.backgroundColor = getQuestionColor(score);
        cell.style.color = score >= 2 && score <= 4 ? '#1a1a2e' : '#f8fafc';
        cell.textContent = score;

        td.appendChild(cell);
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });
  });

  table.appendChild(tbody);
  container.appendChild(table);

  // Scroll to the right (most recent data)
  requestAnimationFrame(() => {
    wrapper.scrollLeft = wrapper.scrollWidth;
  });
}

// ============================================================
// Sparklines
// ============================================================

function renderSparkline(container, values) {
  if (values.length < 2) return;

  const width = 60;
  const height = 24;
  const padding = 2;

  const svg = d3.select(container)
    .append('svg')
    .attr('class', 'sparkline')
    .attr('width', width)
    .attr('height', height);

  const xScale = d3.scaleLinear()
    .domain([0, values.length - 1])
    .range([padding, width - padding]);

  const yScale = d3.scaleLinear()
    .domain([d3.min(values) - 5, d3.max(values) + 5])
    .range([height - padding, padding]);

  const line = d3.line()
    .x((d, i) => xScale(i))
    .y(d => yScale(d))
    .curve(d3.curveMonotoneX);

  svg.append('path')
    .datum(values)
    .attr('d', line);
}

// ============================================================
// Tooltip
// ============================================================

const tooltip = document.getElementById('tooltip');
const tooltipTitle = document.getElementById('tooltipTitle');
const tooltipValue = document.getElementById('tooltipValue');

function showTooltip(event, dimension, value, session) {
  tooltipTitle.textContent = dimension;
  tooltipValue.innerHTML = `${value}%<br><span style="color: var(--text-muted); font-size: 11px;">${session.session_id}</span>`;
  
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY - 12}px`;
  tooltip.classList.add('visible');
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

// ============================================================
// Detail Panel
// ============================================================

const detailPanel = document.getElementById('detailPanel');
const closeDetailBtn = document.getElementById('closeDetailPanel');

function openDetailPanel(session, highlightDimension = null) {
  document.getElementById('detailPanelTitle').textContent = session.session_id;
  document.getElementById('detailPanelMeta').innerHTML = `
    ${formatSessionDate(session.date)} · ${session.model}<br>
    ${session.system_state}<br>
    <strong>Total: ${session.total_pct}%</strong>
  `;

  const grid = document.getElementById('detailQuestionGrid');
  grid.innerHTML = '';
  
  for (let i = 1; i <= 35; i++) {
    const qKey = `q${String(i).padStart(2, '0')}`;
    const score = session[qKey];
    
    const cell = document.createElement('div');
    cell.className = 'question-cell';
    cell.style.backgroundColor = getQuestionColor(score);
    cell.style.color = score >= 2 && score <= 4 ? '#1a1a2e' : '#f8fafc';
    cell.textContent = score;
    cell.title = `Q${String(i).padStart(2, '0')}: ${score}`;
    grid.appendChild(cell);
  }

  document.getElementById('detailConstraints').textContent = 
    session.constraints_observed || 'No constraints recorded';
  document.getElementById('detailInterpretation').textContent = 
    session.interpretation_notes || 'No interpretation notes';

  detailPanel.classList.add('open');
}

closeDetailBtn.addEventListener('click', () => {
  detailPanel.classList.remove('open');
});

// ============================================================
// View Toggle
// ============================================================

const toggleBtns = document.querySelectorAll('.toggle-btn');

toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    state.currentView = view;

    toggleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('summaryHeatmapContainer').style.display = view === 'summary' ? 'block' : 'none';
    document.getElementById('detailHeatmapContainer').style.display = view === 'detail' ? 'block' : 'none';
  });
});

// ============================================================
// Filter Controls
// ============================================================

const sessionCountFilter = document.getElementById('sessionCountFilter');
const dimensionFilter = document.getElementById('dimensionFilter');
const systemStateFilter = document.getElementById('systemStateFilter');

sessionCountFilter.addEventListener('change', (e) => {
  state.sessionCount = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
  applyFiltersAndRender();
});

dimensionFilter.addEventListener('change', (e) => {
  state.selectedDimension = e.target.value;
  state.hiddenDimensions.clear(); // Reset hidden dimensions when switching
  applyFiltersAndRender();
});

systemStateFilter.addEventListener('change', (e) => {
  state.selectedSystemState = e.target.value;
  applyFiltersAndRender();
});

function populateSystemStateFilter() {
  const states = getUniqueSystemStates();
  systemStateFilter.innerHTML = '<option value="all" selected>All States</option>';
  states.forEach(s => {
    const option = document.createElement('option');
    option.value = s;
    option.textContent = s;
    systemStateFilter.appendChild(option);
  });
}

function applyFiltersAndRender() {
  state.filteredData = getFilteredData();
  renderTrendChart(state.filteredData);
  renderSummaryHeatmap(state.filteredData);
  renderDetailHeatmap(state.filteredData);
}

// ============================================================
// Collapsible Import Card
// ============================================================

const importCard = document.getElementById('importCard');
const importCardHeader = importCard.querySelector('.card-header');

importCardHeader.addEventListener('click', () => {
  importCard.classList.toggle('collapsed');
});

// ============================================================
// File Operations
// ============================================================

const btnSelectFile = document.getElementById('btnSelectFile');
const btnProcess = document.getElementById('btnProcess');
const btnSelectCSV = document.getElementById('btnSelectCSV');
const selectedFilePath = document.getElementById('selectedFilePath');
const processingStatus = document.getElementById('processingStatus');
const processingOutput = document.getElementById('processingOutput');
const csvStatusDot = document.getElementById('csvStatusDot');
const csvStatusText = document.getElementById('csvStatusText');

btnSelectFile.addEventListener('click', async (e) => {
  e.stopPropagation(); // Prevent card collapse
  const result = await window.api.openMarkdownDialog();
  if (!result.canceled) {
    state.selectedMarkdownPath = result.filePath;
    selectedFilePath.textContent = result.fileName;
    selectedFilePath.classList.add('has-file');
    btnProcess.disabled = !state.csvPath;
  }
});

btnSelectCSV.addEventListener('click', async () => {
  const result = await window.api.selectCSVDialog();
  if (!result.canceled) {
    state.csvPath = result.filePath;
    await loadAndRenderData();
    await saveSettings();
    updateCSVStatus();
    btnProcess.disabled = !state.selectedMarkdownPath;
  }
});

btnProcess.addEventListener('click', async (e) => {
  e.stopPropagation(); // Prevent card collapse
  if (!state.selectedMarkdownPath || !state.csvPath) return;

  btnProcess.disabled = true;
  processingStatus.classList.add('visible');
  processingStatus.classList.remove('success', 'error');
  processingOutput.textContent = 'Processing...';

  const result = await window.api.runLoader({
    markdownPath: state.selectedMarkdownPath,
    csvPath: state.csvPath,
    pythonPath: state.pythonPath,
  });

  if (result.success) {
    processingStatus.classList.add('success');
    processingOutput.textContent = result.stdout || 'Successfully processed!';
    
    await loadAndRenderData();
    
    state.selectedMarkdownPath = null;
    selectedFilePath.textContent = 'No file selected';
    selectedFilePath.classList.remove('has-file');
  } else {
    processingStatus.classList.add('error');
    processingOutput.textContent = `Error: ${result.error}\n\n${result.stderr || ''}\n${result.stdout || ''}`;
  }

  btnProcess.disabled = true;
});

window.api.onPythonProgress((data) => {
  processingOutput.textContent += data;
  processingOutput.scrollTop = processingOutput.scrollHeight;
});

// ============================================================
// Settings Persistence
// ============================================================

async function loadSettings() {
  const settings = await window.api.loadSettings();
  if (settings.csvPath) {
    state.csvPath = settings.csvPath;
  }
  if (settings.pythonPath) {
    state.pythonPath = settings.pythonPath;
  }
}

async function saveSettings() {
  await window.api.saveSettings({
    csvPath: state.csvPath,
    pythonPath: state.pythonPath,
  });
}

function updateCSVStatus() {
  if (state.csvPath) {
    csvStatusDot.classList.add('connected');
    const fileName = state.csvPath.split(/[/\\]/).pop();
    csvStatusText.textContent = fileName;
  } else {
    csvStatusDot.classList.remove('connected');
    csvStatusText.textContent = 'No CSV loaded';
  }
}

// ============================================================
// Data Loading and Rendering
// ============================================================

async function loadAndRenderData() {
  if (!state.csvPath) {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('heatmapContainer').style.display = 'none';
    document.getElementById('trendEmptyState').style.display = 'block';
    document.getElementById('trendChartContainer').style.display = 'none';
    return;
  }

  state.data = await loadCSVData(state.csvPath);

  if (state.data.length === 0) {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('heatmapContainer').style.display = 'none';
    document.getElementById('trendEmptyState').style.display = 'block';
    document.getElementById('trendChartContainer').style.display = 'none';
    return;
  }

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('heatmapContainer').style.display = 'block';

  // Populate system state filter
  populateSystemStateFilter();

  // Apply filters and render
  applyFiltersAndRender();
}

// ============================================================
// Window Resize Handler
// ============================================================

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (state.filteredData.length > 0) {
      renderTrendChart(state.filteredData);
    }
  }, 150);
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  await loadSettings();
  updateCSVStatus();
  await loadAndRenderData();
}

init();
