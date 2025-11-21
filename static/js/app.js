/**
 * YOLO11 Multi-Layer Detection Web Application
 * JavaScript Frontend Controller
 * Created: 2025-11-21
 */

// Global variables
let currentTaskId = null;
let uploadedFile = null;
let detectionResults = null;

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const clearImage = document.getElementById('clearImage');
const uploadBtn = document.getElementById('uploadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const toastContainer = document.getElementById('toastContainer');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadSystemStats();
    setInterval(loadSystemStats, 30000); // Update every 30 seconds
});

// Event Listeners
function initializeEventListeners() {
    // Dropzone events
    dropzone.addEventListener('click', () => fileInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('active');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('active');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });
    
    // File input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    // Clear image
    clearImage.addEventListener('click', clearSelectedImage);
    
    // Upload button
    uploadBtn.addEventListener('click', uploadImage);
    
    // Results actions
    document.getElementById('downloadBtn')?.addEventListener('click', downloadResults);
    document.getElementById('newAnalysisBtn')?.addEventListener('click', resetAnalysis);
    
    // Search
    document.getElementById('searchInput')?.addEventListener('input', filterDetections);
}

// File handling
function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        showToast('올바른 이미지 파일을 선택해주세요', 'error');
        return;
    }
    
    if (file.size > 100 * 1024 * 1024) {
        showToast('파일 크기는 100MB 이하여야 합니다', 'error');
        return;
    }
    
    uploadedFile = file;
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        document.querySelector('.dropzone-content').style.display = 'none';
        previewContainer.style.display = 'block';
        uploadBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

function clearSelectedImage() {
    uploadedFile = null;
    fileInput.value = '';
    previewImage.src = '';
    document.querySelector('.dropzone-content').style.display = 'flex';
    previewContainer.style.display = 'none';
    uploadBtn.disabled = true;
}

// Upload and detection
async function uploadImage() {
    if (!uploadedFile) return;
    
    const formData = new FormData();
    formData.append('file', uploadedFile);
    
    uploadBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '업로드 중...';
    
    try {
        // Upload file
        const uploadResponse = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error('업로드 실패');
        }
        
        const uploadData = await uploadResponse.json();
        currentTaskId = uploadData.task_id;
        
        // Monitor detection progress
        monitorDetection();
        
    } catch (error) {
        showToast(`오류: ${error.message}`, 'error');
        uploadBtn.disabled = false;
        progressContainer.style.display = 'none';
    }
}

async function monitorDetection() {
    if (!currentTaskId) return;
    
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/detect/${currentTaskId}`);
            const data = await response.json();
            
            if (data.status === 'processing') {
                progressFill.style.width = `${data.progress}%`;
                progressText.textContent = data.message || '처리 중...';
            } else if (data.status === 'completed') {
                clearInterval(checkInterval);
                progressFill.style.width = '100%';
                progressText.textContent = '완료!';
                
                // Load results
                await loadResults();
                
                // Reset upload section
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                    clearSelectedImage();
                }, 1000);
                
            } else if (data.status === 'error') {
                clearInterval(checkInterval);
                showToast(`오류: ${data.message}`, 'error');
                uploadBtn.disabled = false;
                progressContainer.style.display = 'none';
            }
        } catch (error) {
            clearInterval(checkInterval);
            showToast('검출 상태 확인 실패', 'error');
            uploadBtn.disabled = false;
            progressContainer.style.display = 'none';
        }
    }, 500);
}

async function loadResults() {
    if (!currentTaskId) return;
    
    try {
        const response = await fetch(`/results/${currentTaskId}`);
        const data = await response.json();
        
        detectionResults = data;
        displayResults(data);
        resultsSection.style.display = 'block';
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
        
        showToast('검출 완료!', 'success');
        
    } catch (error) {
        showToast('결과 로드 실패', 'error');
    }
}

function displayResults(data) {
    // Display result image
    if (data.result_image) {
        document.getElementById('resultImage').src = data.result_image;
    }
    
    // Statistics
    document.getElementById('totalDetections').textContent = data.total_detections || 0;
    
    // Calculate average confidence
    let avgConfidence = 0;
    if (data.detections && data.detections.length > 0) {
        const sum = data.detections.reduce((acc, det) => acc + det.confidence, 0);
        avgConfidence = (sum / data.detections.length * 100).toFixed(1);
    }
    document.getElementById('avgConfidence').textContent = `${avgConfidence}%`;
    
    // Process time (mock)
    document.getElementById('processTime').textContent = '1.8s';
    
    // Layer statistics
    const layerStatsContainer = document.getElementById('layerStats');
    layerStatsContainer.innerHTML = '';
    
    if (data.layers) {
        data.layers.forEach(layer => {
            const layerStat = document.createElement('div');
            layerStat.className = 'layer-stat-item';
            layerStat.innerHTML = `
                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--gray-200);">
                    <span style="font-weight: 600;">${layer.name}</span>
                    <span style="color: var(--primary-600); font-weight: 600;">${layer.detections} 검출</span>
                </div>
            `;
            layerStatsContainer.appendChild(layerStat);
        });
    }
    
    // Detection list
    displayDetections(data.detections);
}

function displayDetections(detections) {
    const detectionList = document.getElementById('detectionList');
    detectionList.innerHTML = '';
    
    if (!detections || detections.length === 0) {
        detectionList.innerHTML = '<p style="text-align: center; color: var(--gray-500);">검출된 객체가 없습니다</p>';
        return;
    }
    
    detections.forEach((det, index) => {
        const item = document.createElement('div');
        item.className = 'detection-item';
        item.innerHTML = `
            <span style="color: var(--gray-500); font-size: 0.875rem;">#${index + 1}</span>
            <span class="detection-class">${det.class}</span>
            <span class="detection-confidence">${(det.confidence * 100).toFixed(1)}%</span>
            <span class="detection-layer">Layer ${det.layer}</span>
        `;
        detectionList.appendChild(item);
    });
}

function filterDetections(e) {
    const searchTerm = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.detection-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'grid' : 'none';
    });
}

async function downloadResults() {
    if (!currentTaskId) return;
    
    try {
        window.location.href = `/download/${currentTaskId}`;
        showToast('다운로드 시작', 'success');
    } catch (error) {
        showToast('다운로드 실패', 'error');
    }
}

function resetAnalysis() {
    resultsSection.style.display = 'none';
    currentTaskId = null;
    detectionResults = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// System stats
async function loadSystemStats() {
    try {
        const response = await fetch('/stats');
        const stats = await response.json();
        
        document.getElementById('serverStatus').textContent = 
            stats.detector_status === 'ready' ? '정상' : '초기화 중...';
        
        document.getElementById('gpuStatus').textContent = 
            stats.gpu_available ? stats.gpu_name : 'CPU 모드';
        
        document.getElementById('processedImages').textContent = 
            stats.processed_images || 0;
        
        document.getElementById('cacheSize').textContent = 
            stats.cache_size || 0;
        
    } catch (error) {
        console.error('Failed to load system stats:', error);
    }
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    }[type] || 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}" style="font-size: 1.5rem;"></i>
        <div>
            <strong>${type === 'success' ? '성공' : type === 'error' ? '오류' : '알림'}</strong>
            <p style="margin: 0; font-size: 0.875rem;">${message}</p>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + O: Open file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
    }
    
    // Ctrl/Cmd + Enter: Start detection
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!uploadBtn.disabled) {
            uploadImage();
        }
    }
    
    // Escape: Clear/Reset
    if (e.key === 'Escape') {
        if (uploadedFile) {
            clearSelectedImage();
        } else if (resultsSection.style.display !== 'none') {
            resetAnalysis();
        }
    }
});

// Add smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Add animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements with animation
document.querySelectorAll('.animate-slide').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    observer.observe(el);
});