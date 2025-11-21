"""
YOLO11 Multi-Layer Detection Web Application
Forest Green UI Design System 적용
작성일: 2025년 11월 21일
"""

from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os
import json
import base64
from datetime import datetime
from threading import Thread
import time
import uuid

# Multi-layer detector import
from multi_layer_detector import MultiLayerObjectDetector

# Flask 앱 초기화
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB 제한
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['RESULTS_FOLDER'] = 'results'
app.secret_key = 'yolo11-multi-layer-detection-2025'

# 업로드 허용 확장자
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}

# 폴더 생성
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)
os.makedirs('static', exist_ok=True)

# 전역 검출기 인스턴스
detector = None
detection_cache = {}
detection_progress = {}

def allowed_file(filename):
    """파일 확장자 확인"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def initialize_detector():
    """검출기 초기화"""
    global detector
    if detector is None:
        try:
            detector = MultiLayerObjectDetector(device='auto')
            print("✅ 검출기 초기화 완료")
            return True
        except Exception as e:
            print(f"❌ 검출기 초기화 실패: {e}")
            return False
    return True

def get_image_base64(image_path):
    """이미지를 base64로 인코딩"""
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
        return base64.b64encode(image_data).decode('utf-8')
    except:
        return None

def process_detection(task_id, filepath):
    """백그라운드에서 검출 수행"""
    global detection_progress, detection_cache
    
    try:
        detection_progress[task_id] = {
            'status': 'processing',
            'progress': 0,
            'message': '검출기 초기화 중...'
        }
        
        # 검출기 초기화
        if not initialize_detector():
            detection_progress[task_id] = {
                'status': 'error',
                'message': '검출기 초기화 실패'
            }
            return
        
        # 각 레이어별 진행 상황 업데이트
        layer_messages = [
            'Layer 1: 빠른 스캔 중...',
            'Layer 2: 일반 검출 중...',
            'Layer 3: 정밀 검출 중...',
            'Layer 4: 세그멘테이션 중...',
            '결과 병합 중...'
        ]
        
        # 검출 수행
        for i, msg in enumerate(layer_messages[:4]):
            detection_progress[task_id] = {
                'status': 'processing',
                'progress': (i + 1) * 20,
                'message': msg
            }
            time.sleep(0.5)  # 시뮬레이션 (실제로는 검출 진행)
        
        # 실제 검출 수행
        results = detector.detect_multi_layer(filepath, visualize_layers=True)
        
        detection_progress[task_id] = {
            'status': 'processing',
            'progress': 90,
            'message': '결과 처리 중...'
        }
        
        # 결과 이미지 저장
        result_filename = f"result_{task_id}.jpg"
        result_path = os.path.join(app.config['RESULTS_FOLDER'], result_filename)
        
        # visualized_image가 있으면 저장
        if 'visualized_image' in results:
            import cv2
            cv2.imwrite(result_path, results['visualized_image'])
            results['result_image'] = result_filename
        
        # 캐시에 저장
        detection_cache[task_id] = {
            'results': results,
            'timestamp': datetime.now().isoformat(),
            'original_file': os.path.basename(filepath)
        }
        
        detection_progress[task_id] = {
            'status': 'completed',
            'progress': 100,
            'message': '검출 완료!'
        }
        
    except Exception as e:
        detection_progress[task_id] = {
            'status': 'error',
            'message': str(e)
        }

@app.route('/')
def index():
    """메인 페이지"""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    """파일 업로드 처리"""
    if 'file' not in request.files:
        return jsonify({'error': '파일이 없습니다'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '파일이 선택되지 않았습니다'}), 400
    
    if file and allowed_file(file.filename):
        # 안전한 파일명 생성
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        # 파일 저장
        file.save(filepath)
        
        # 태스크 ID 생성
        task_id = str(uuid.uuid4())
        
        # 백그라운드 검출 시작
        thread = Thread(target=process_detection, args=(task_id, filepath))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'task_id': task_id,
            'filename': unique_filename
        })
    
    return jsonify({'error': '지원하지 않는 파일 형식입니다'}), 400

@app.route('/detect/<task_id>')
def detect_status(task_id):
    """검출 진행 상황 확인"""
    if task_id in detection_progress:
        return jsonify(detection_progress[task_id])
    return jsonify({'status': 'not_found'}), 404

@app.route('/results/<task_id>')
def get_results(task_id):
    """검출 결과 반환"""
    if task_id not in detection_cache:
        return jsonify({'error': '결과를 찾을 수 없습니다'}), 404
    
    cache_data = detection_cache[task_id]
    results = cache_data['results']
    
    # 결과 요약
    summary = {
        'task_id': task_id,
        'timestamp': cache_data['timestamp'],
        'original_file': cache_data['original_file'],
        'total_detections': len(results.get('final_detections', [])),
        'layers': []
    }
    
    # 각 레이어별 결과
    for i in range(4):
        layer_key = f'layer_{i+1}_detections'
        if layer_key in results:
            summary['layers'].append({
                'name': f'Layer {i+1}',
                'detections': len(results[layer_key])
            })
    
    # 검출된 객체들
    detections = []
    for det in results.get('final_detections', []):
        detections.append({
            'class': det.get('class_name', 'Unknown'),
            'confidence': round(float(det.get('confidence', 0)), 3),
            'layer': det.get('layer_idx', 0) + 1,
            'bbox': det.get('bbox', [])
        })
    
    # 신뢰도 기준 정렬
    detections.sort(key=lambda x: x['confidence'], reverse=True)
    summary['detections'] = detections
    
    # 결과 이미지 URL
    if 'result_image' in results:
        summary['result_image'] = f"/results/image/{results['result_image']}"
    
    return jsonify(summary)

@app.route('/results/image/<filename>')
def get_result_image(filename):
    """결과 이미지 반환"""
    try:
        return send_file(os.path.join(app.config['RESULTS_FOLDER'], filename))
    except:
        return 'Image not found', 404

@app.route('/stats')
def get_stats():
    """시스템 통계"""
    stats = {
        'detector_status': 'ready' if detector else 'not_initialized',
        'processed_images': len(detection_cache),
        'active_tasks': len([p for p in detection_progress.values() if p['status'] == 'processing']),
        'cache_size': len(detection_cache)
    }
    
    # GPU 정보 추가
    try:
        import torch
        if torch.cuda.is_available():
            stats['gpu_available'] = True
            stats['gpu_name'] = torch.cuda.get_device_name(0)
            stats['gpu_memory'] = f"{torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB"
        else:
            stats['gpu_available'] = False
    except:
        stats['gpu_available'] = False
    
    return jsonify(stats)

@app.route('/download/<task_id>')
def download_results(task_id):
    """결과 JSON 다운로드"""
    if task_id not in detection_cache:
        return jsonify({'error': '결과를 찾을 수 없습니다'}), 404
    
    cache_data = detection_cache[task_id]
    
    # JSON 파일 생성
    json_filename = f"detection_results_{task_id}.json"
    json_path = os.path.join(app.config['RESULTS_FOLDER'], json_filename)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(cache_data['results'], f, indent=2, ensure_ascii=False, default=str)
    
    return send_file(json_path, as_attachment=True)

@app.route('/clear-cache', methods=['POST'])
def clear_cache():
    """캐시 초기화"""
    global detection_cache, detection_progress
    detection_cache.clear()
    detection_progress.clear()
    return jsonify({'success': True, 'message': '캐시가 초기화되었습니다'})

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': '파일 크기가 너무 큽니다 (최대 100MB)'}), 413

@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('500.html'), 500

# 개발 서버 실행
if __name__ == '__main__':
    print("""
    ╔══════════════════════════════════════════════════╗
    ║  YOLO11 Multi-Layer Detection Web Application   ║
    ║          Forest Green UI Design System          ║
    ╚══════════════════════════════════════════════════╝
    
    🌐 서버 시작 중...
    📍 URL: http://localhost:5000
    🎨 UI: Forest Green Design System
    
    """)
    
    # 초기 검출기 로드
    initialize_detector()
    
    # 개발 서버 실행
    app.run(debug=True, host='0.0.0.0', port=5000)