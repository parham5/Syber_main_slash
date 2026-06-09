// Screen Time Settings JS

// Mock weekly usage data (in hours)
const weeklyData = {
    'Sun': 1.5,
    'Mon': 4.5,
    'Tue': 3.2,
    'Wed': 8.5,
    'Thu': 5.0,
    'Fri': 2.1,
    'Sat': 0.5
};

// Today's usage (mock - 4h 23m)
const todayHours = 4;
const todayMinutes = 23;

document.addEventListener('DOMContentLoaded', () => {
    // Display today's usage
    const todayElement = document.getElementById('today-hours');
    if (todayElement) {
        const totalMinutes = todayHours * 60 + todayMinutes;
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        todayElement.textContent = `${hours}h ${mins}m`;
    }
    
    // Calculate weekly stats
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = new Date().getDay();
    const weekDays = days.slice(0, todayIndex + 1);
    
    const weekHours = weekDays.map(day => weeklyData[day]);
    const totalHours = weekHours.reduce((a, b) => a + b, 0);
    const meanHours = totalHours / weekHours.length;
    
    // Display mean usage
    const meanElement = document.getElementById('mean-usage');
    if (meanElement) {
        const meanH = Math.floor(meanHours);
        const meanM = Math.round((meanHours - meanH) * 60);
        meanElement.textContent = `${meanH}h ${meanM}m`;
    }
    
    // Find most active day
    let maxHours = 0;
    let mostActive = '-';
    weekDays.forEach(day => {
        if (weeklyData[day] > maxHours) {
            maxHours = weeklyData[day];
            mostActive = day;
        }
    });
    const activeElement = document.getElementById('most-active-day');
    if (activeElement) activeElement.textContent = mostActive;
    
    // Render chart
    renderChart();
    
    // Load saved limit settings
    const saved = loadScreenTimeSettings();
    const limitToggle = document.getElementById('limitToggle');
    const limitWrapper = document.getElementById('limitControlWrapper');
    const limitHours = document.getElementById('limitHours');
    const limitMinutes = document.getElementById('limitMinutes');
    
    if (limitToggle) {
        limitToggle.checked = saved.limitEnabled;
        if (limitWrapper) {
            limitWrapper.style.opacity = saved.limitEnabled ? '1' : '0.5';
            limitWrapper.style.pointerEvents = saved.limitEnabled ? 'auto' : 'none';
        }
    }
    
    if (limitHours) limitHours.value = saved.hours;
    if (limitMinutes) limitMinutes.value = saved.minutes;
    
    // Toggle limit
    if (limitToggle) {
        limitToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            if (limitWrapper) {
                limitWrapper.style.opacity = enabled ? '1' : '0.5';
                limitWrapper.style.pointerEvents = enabled ? 'auto' : 'none';
            }
            saveScreenTimeSettings(enabled, 
                parseInt(limitHours?.value) || 0, 
                parseInt(limitMinutes?.value) || 0
            );
        });
    }
    
    // Save limit values on change
    const saveLimit = () => {
        saveScreenTimeSettings(
            limitToggle?.checked || false,
            parseInt(limitHours?.value) || 0,
            parseInt(limitMinutes?.value) || 0
        );
    };
    
    if (limitHours) limitHours.addEventListener('change', saveLimit);
    if (limitMinutes) limitMinutes.addEventListener('change', saveLimit);
});

function renderChart() {
    const chartContainer = document.getElementById('weeklyChart');
    if (!chartContainer) return;
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = new Date().getDay();
    const displayDays = days.slice(0, todayIndex + 1);
    
    chartContainer.innerHTML = '';
    
    displayDays.forEach(day => {
        const hours = weeklyData[day];
        const heightPercent = Math.min((hours / 10) * 100, 100);
        
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-bar-wrapper';
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${hours > 5 ? 'bar-high' : hours > 3 ? 'bar-normal' : 'bar-low'}`;
        bar.style.height = `${heightPercent}%`;
        
        if (day === days[todayIndex]) {
            bar.style.border = '2px solid var(--text-primary)';
        }
        
        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = day;
        
        wrapper.appendChild(bar);
        wrapper.appendChild(label);
        chartContainer.appendChild(wrapper);
    });
}