# ComfyUI 원격 사용 (SSH)

그림 생성용 GPU PC에 SSH로 접속해 ComfyUI를 띄우고 워크플로를 돌리는 방법. 지금은 이미지를 만들지 않고, 작업용 PC에서 쓸 수 있도록 접근 경로만 정리해 둔다. 만들 그림 목록과 프롬프트는 `bevy/ART_DIRECTION.md`의 "Wanted" 항목 참고.

## 접속 정보

| 항목 | 값 |
|---|---|
| 호스트 | `agent@172.30.1.99` (DESKTOP-D0GV75E, Windows 11, 같은 공유기 안에서만) |
| 인증 | `agent` 계정의 기존 SSH 인증 그대로. `user` 계정은 암호가 없어 SSH 로그인 불가 |
| 권한 | `agent`는 `F:\ComfyUI` 수정 가능, ComfyUI 코어(`...\ComfyUI-Installs\ComfyUI`)와 기반 Python(`...\uv\python\cpython-3.12.11-...`)은 읽기·실행만 |
| SSH 기본 셸 | `cmd.exe` |
| GPU | RTX 4060 Ti 8GB, RAM 32GB |
| ComfyUI | `F:\ComfyUI` (venv·모델·입출력), torch 2.12.1+cu130 |
| 제어 스크립트 | `F:\ComfyUI\scripts\comfy.cmd` |
| 헤드리스 포트 | `127.0.0.1:8189` (8188은 Comfy Desktop 앱이 씀) |

- IP는 정적 할당. 접속이 안 되면 GPU PC에서 `ipconfig`로 확인.
- 서버는 localhost에만 열려 있다. 작업용 PC에서 API나 웹 UI를 쓰려면 SSH 포트 포워딩을 쓴다(아래).

## 명령

모두 작업용 PC에서 실행한다.

```sh
# 서버 켜기 (이미 떠 있으면 그대로 알려줌). 콜드 스타트는 1~2분.
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd start"

# 상태 / 로그 / 끄기
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd status"
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd log 60"
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd stop"

# 워크플로 실행: 끝날 때까지 기다렸다가 출력 파일 경로를 찍는다
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd run F:\ComfyUI\scripts\workflows\sdxl_txt2img.api.json"
```

`run`의 종료 코드: 0 성공, 1 실행 중 오류(노드·예외 메시지 출력), 2 워크플로 거부(없는 모델·잘못된 입력), 3 시간 초과(기본 3600초, `-TimeoutSec`로 변경), 4 서버 미응답.

서버는 SSH 세션과 분리된 프로세스로 뜨도록 만들어서 접속을 끊어도 유지되는 것이 의도다. 쓰고 나면 `stop`으로 끈다(VRAM을 계속 잡고 있음).

## 내 워크플로 돌리기

1. 워크플로를 **API 포맷** JSON으로 준비한다. ComfyUI 웹 UI에서 저장한 일반 워크플로(`nodes`/`links`가 있는 파일)는 거부된다. 웹 UI의 `Workflow > Export (API)`로 내보내거나, 아래 예제를 고쳐 쓴다.
2. GPU PC로 올린다.
   ```sh
   scp my.api.json agent@172.30.1.99:F:/ComfyUI/scripts/workflows/
   ```
3. 입력 이미지가 필요하면 `F:/ComfyUI/input/`에 올리고 `LoadImage`의 `image`에 파일명만 적는다.
4. 실행하고 결과를 받아온다.
   ```sh
   ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd run F:\ComfyUI\scripts\workflows\my.api.json"
   scp agent@172.30.1.99:F:/ComfyUI/output/<찍힌 파일명>.png bevy/assets/art/
   ```

웹 UI로 직접 만지고 싶으면 포트 포워딩을 걸고 브라우저에서 `http://127.0.0.1:8189`를 연다.

```sh
ssh -L 8189:127.0.0.1:8189 agent@172.30.1.99
```

포워딩이 걸린 동안에는 작업용 PC에서 `POST http://127.0.0.1:8189/prompt`, `GET /history/<prompt_id>`로 API를 직접 불러도 된다.

웹 UI의 워크플로 목록에 있는 `bc_mouse_sketch`가 생쥐 스케치 시작점이다: Nova Animal XL → LoRA A(스케치) → LoRA B(겹쳐 쓰기용, 강도 0이면 꺼짐) → 1024², 4장, 시드 고정. 자세별 태그와 LoRA 트리거는 캔버스의 Note 노드에 적혀 있고, 출력은 `output/bc_ui/`에 쌓인다.

## 들어 있는 모델

`F:\ComfyUI\models` 아래. 이 외의 모델은 없다(예전 워크플로가 쓰던 dvine, Wan, IP-Adapter 등은 전부 없음).

| 파일 | 폴더 | 용도 |
|---|---|---|
| `sd_xl_base_1.0.safetensors` | `checkpoints` | SDXL 기본 txt2img |
| `qwen-image-edit-2511-Q6_K.gguf` | `diffusion_models` | Qwen Image Edit 2511 (GGUF, `LoaderGGUF` 노드) |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `text_encoders` | Qwen 텍스트 인코더 |
| `qwen_image_vae.safetensors` | `vae` | Qwen VAE |
| `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | `loras` | Qwen 4스텝 LoRA |

모델을 추가하려면 해당 폴더에 파일을 넣으면 된다(서버 재시작 불필요, 다음 실행 때 인식).

### 생쥐 스케치용 (2026-10-13 추가)

| 파일 | 폴더 | 용도 |
|---|---|---|
| `novaAnimalXL_ilV120.safetensors` | `checkpoints` | Nova Animal XL (Illustrious). 생쥐 스케치 기준 체크포인트 |
| `illustriousPencilXL_v320.safetensors` | `checkpoints` | illustrious pencil-XL. 배경에 색이 끼고 선이 파랗게 나와 보류 |

LoRA는 전부 `loras` 폴더. 트리거는 긍정 프롬프트 맨 앞에 둔다. "상업"은 Civitai 표기상 생성 이미지의 상업 이용 허용 여부.

| 파일 | 계열 | 트리거 | 상업 | 첫인상 (Nova, 강도 1.0) |
|---|---|---|---|---|
| `rough_sketch_xl_v2.safetensors` | SDXL | `rough sketch` | O | 기준. 깔끔한 연필 선, 선 수는 적음 |
| `hatching01_il.safetensors` | Illustrious | `monochrome, hatching` | O | 가장 가는 선, 흰 바탕. 서명 상자 같은 게 붙음 |
| `pen_on_paper_il.safetensors` | Illustrious | `monochrome, greyscale, traditional media, sketch` | O | 부드러운 연필 음영, 풀 포기가 붙음 |
| `chickenscratch_xl.safetensors` | SDXL | `chickenscratch, a chickenscratch style pencil drawing` | O | 짧은 선을 겹친 음영, 바탕이 회색 |
| `fishie_sketch_il.safetensors` | Illustrious | `greyscale, sketch, graphite (medium)` | O | 털 결이 거친 흑연, 바탕이 어두운 회색 |
| `naive_storybook_il.safetensors` | Illustrious | `ArsMJStyle, AzureSketch` | O | 판화풍 굵은 해칭, 땅이 그려짐 |
| `storybook_animals_xl.safetensors` | SDXL | `digital storybook illustration, textured brushwork` | O | 부드러운 음영의 동화책풍 |
| `Rough_Sketch_style-000008.safetensors` | Illustrious | 없음 | O | 굵은 잉크 외곽선, 근육질 체형 |
| `Sketch_Art_-_Rough_lines_and_lineart.safetensors` | Illustrious | `skeart` (1.6 이상) | **X** | 가는 연필 해칭이 많음. 종이가 회색 |

Civitai는 로그인이 필요한 파일에도 HTTP 200으로 HTML을 돌려준다. `curl -r 0-0`의 응답이 206인 것만 실제로 받아진다.

## 예제 워크플로

`F:\ComfyUI\scripts\workflows\`에 있다.

- `sdxl_txt2img.api.json` — SDXL 1024×1024, 20스텝. 프롬프트는 노드 `6`(긍정)·`7`(부정)의 `text`, 시드는 노드 `3`의 `seed`, 파일명 접두어는 노드 `9`의 `filename_prefix`.
- `qwen_edit.api.json` — 입력 이미지 1장 + 지시문으로 편집, 4스텝. 입력은 노드 `21`의 `image`, 지시문은 노드 `19`의 `prompt`.

## 검증 상태 (2026-10-12)

- [x] `comfy start` / `status` — GPU PC 로컬 셸에서 확인
- [x] `sdxl_txt2img.api.json` — 이미지 생성 확인. 첫 실행 198초(대부분 모델 로딩), 이후는 더 빠름
- [x] `qwen_edit.api.json` — 1024×1024 출력 확인. 첫 실행 667초(모델 로딩 + 17GB 모델을 8GB VRAM에 부분 적재), 샘플링 자체는 4스텝에 약 40초
- [ ] **SSH 경유 실행(`agent` 계정)** — 미확인. 위 검증은 전부 `user` 계정으로 한 것이다. 작업용 PC에서 `start` → 접속 종료 → `status` 순서로 한 번 확인할 것.
  - `start`가 "Detached start was refused" 경고를 내면 `agent`에게 분리 실행이 허용되지 않은 것이다. 이때 서버는 그 SSH 세션이 열려 있는 동안만 산다.
  - `agent` 계정에서는 모델 캐시 등 홈 폴더가 `user`와 다르다. 일부 커스텀 노드가 처음 쓸 때 파일을 다시 받을 수 있다.
- [ ] `scp`의 `F:/...` 경로 표기 — 미확인. 안 되면 `/F:/ComfyUI/...` 형태로 시도.

## `agent` 계정으로 SSH에서 돌릴 때 (2026-10-12 실측)

`comfy.cmd start`는 `agent`에서 쓸 수 없다. 대신 `F:\ComfyUI\scripts\start_fg.cmd`를 SSH 세션 안에서 전경으로 실행하고 그 세션을 열어 둔다(세션을 닫으면 서버도 끝난다). 기동은 약 15초.

```sh
# 세션 1: 서버 (열어 둔다). 로그는 F:\ComfyUI\user\comfyui-agent.log
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\start_fg.cmd"
# 세션 2: 실행
ssh agent@172.30.1.99 "F:\ComfyUI\scripts\comfy.cmd run F:\ComfyUI\scripts\workflows\mouse_ink.api.json"
```

`start_fg.cmd`가 `comfy.cmd start`와 다른 점과 그 이유:

- `NUMBA_CACHE_DIR=F:\ComfyUI\user\numba-cache` — 코어 설치 폴더가 `agent`에게 읽기 전용이라, 이 값이 없으면 numba가 캐시 임시 파일 생성을 끝없이 재시도해 기동이 멈춘다(로그가 `No OpenGL_accelerate` 뒤에서 멈추고 CPU 한 코어만 씀).
- `--database-url ...comfyui-agent.db` — 다른 ComfyUI(Desktop 앱)가 `comfyui.db`를 잡고 있으면 `ASSETS_STARTUP_FAILED: in_use`로 종료된다.
- `--disable-all-custom-nodes --whitelist-custom-nodes gguf` — Qwen 워크플로에 필요한 커스텀 노드는 `LoaderGGUF`(`gguf` 팩)뿐. 다른 팩의 노드가 필요하면 화이트리스트에 폴더명을 추가한다.
- WMI 분리 실행, `taskkill`, `tasklist`는 `agent`에서 거부된다. 프로세스 종료는 `powershell Stop-Process -Id <pid> -Force`.
- `scp`는 `agent@172.30.1.99:F:/ComfyUI/...` 표기로 동작한다.
- `mouse_ink.api.json`(Qwen Edit, 4스텝, 1024×1024) 첫 실행 540초. 입력은 투명 배경을 흰색으로 깐 `input/mouse-poses_white.png`.

## 알아둘 점

- **F 드라이브는 HDD**라 느리다. 서버 기동과 모델 첫 로딩이 분 단위로 걸리고, F에 큰 파일을 쓰는 중에는 서버가 사실상 멈춘다.
- Comfy Desktop 앱(8188)과 헤드리스 서버(8189)는 같은 GPU를 나눠 쓴다. VRAM이 8GB뿐이라 무거운 워크플로는 한쪽만 켜 두는 편이 낫다.
- 커스텀 노드는 `F:\ComfyUI\custom_nodes`의 것만 쓸 수 있다(GGUF, KJNodes, IPAdapter Plus, Essentials, Easy-Use, VideoHelperSuite, WAS, BiRefNet 등).
- GPU PC가 꺼져 있거나 절전이면 접속되지 않는다.
