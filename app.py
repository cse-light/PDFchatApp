import os
import uuid
import fitz  # PyMuPDF
from flask import Flask, request, jsonify, session, send_from_directory, render_template
from werkzeug.utils import secure_filename
import openai
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get("SECRET_KEY", "supersecretkey")

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {"pdf"}

openai.api_key = os.environ.get("OPENAI_API_KEY")  # Set your OpenAI key as env var

# ----- Utility Functions -----
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(filepath):
    text = []
    try:
        with fitz.open(filepath) as doc:
            for page in doc:
                page_text = page.get_text()
                text.append(page_text)
            page_count = doc.page_count
    except Exception as e:
        print(f"Error extracting PDF text: {e}")
        return "", 0
    return "\n".join(text), page_count

def get_session_pdfs():
    if "pdfs" not in session:
        session["pdfs"] = {}
    return session["pdfs"]

def save_session_pdfs(pdfs):
    session["pdfs"] = pdfs

def get_chat_history(pdf_name):
    if "history" not in session:
        session["history"] = {}
    if pdf_name not in session["history"]:
        session["history"][pdf_name] = []
    return session["history"][pdf_name]

def add_chat_history(pdf_name, role, content):
    if "history" not in session:
        session["history"] = {}
    if pdf_name not in session["history"]:
        session["history"][pdf_name] = []
    session["history"][pdf_name].append({"role": role, "content": content})

def clear_chat_history():
    session["history"] = {}

# ----- Routes -----
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    pdfs = get_session_pdfs()
    files = request.files.getlist("pdfs")
    pdf_names = []
    summaries = {}
    for f in files:
        if f and allowed_file(f.filename):
            filename = secure_filename(f.filename)
            save_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4().hex[:8]}_{filename}")
            f.save(save_path)
            text, page_count = extract_text_from_pdf(save_path)
            file_size = round(os.path.getsize(save_path) / 1024.0, 2)  # in KB
            pdfs[filename] = {"path": save_path, "text": text, "pages": page_count, "size": file_size}
            pdf_names.append(filename)
            summaries[filename] = {
                "pages": page_count,
                "size": file_size
            }
    save_session_pdfs(pdfs)
    return jsonify({"status": "ok", "pdf_names": list(pdfs.keys()), "summaries": summaries})

@app.route("/get_pdfs")

def get_pdfs():
    pdfs = get_session_pdfs()
    summaries = {name: {"pages": pdfs[name]["pages"], "size": pdfs[name]["size"]} for name in pdfs}
    return jsonify({"pdf_names": list(pdfs.keys()), "summaries": summaries})

@app.route("/get_history")
def get_history():
    pdf_name = request.args.get("pdf_name", "")
    if pdf_name == "__ALL__":
        all_history = []
        history = session.get("history", {})
        for h in history.values():
            all_history.extend(h)
        return jsonify({"history": all_history})
    return jsonify({"history": get_chat_history(pdf_name)})

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_msg = data.get("message", "").strip()
    pdf_name = data.get("pdf_name", "")

    pdfs = get_session_pdfs()
    if not pdfs:
        return jsonify({"reply": "No PDF uploaded. Please upload a PDF first."})

    # Context: all PDFs or one
    if pdf_name == "__ALL__":
        context = "\n\n".join(
            [pdfs[name]["text"] for name in pdfs if pdfs[name]["text"].strip()]
        )
        context_names = ", ".join([name for name in pdfs])
        system_prompt = (
            f"You are an AI assistant for PDF chat. The user uploaded these PDFs: {context_names}.\n"
            f"Answer based on the content. Use markdown if useful."
        )
    else:
        if pdf_name not in pdfs:
            return jsonify({"reply": "PDF not found or has been removed. Please upload or select a valid PDF."})
        context = pdfs[pdf_name]["text"]

        system_prompt = (
            f"You are an AI assistant for PDF chat. The user uploaded this PDF: {pdf_name}.\n"
            f"Answer based on the content. Use markdown if useful."
        )

    add_chat_history(pdf_name, "user", user_msg)

    chat_history = get_chat_history(pdf_name)
    messages = [{"role": "system", "content": system_prompt}]
    # Only send last 6 exchanges for brevity
    for h in chat_history[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    # Append user's latest with context chunk (limit to 3500 chars)
    messages.append({"role": "user", "content": f"{user_msg}\n\nPDF content:\n{context[:3500]}"})

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=0.2,
            max_tokens=800
        )
        reply = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"OpenAI error: {e}")
        reply = "Sorry, there was an error connecting to the AI. Please try again later."

    add_chat_history(pdf_name, "bot", reply)
    return jsonify({"reply": reply})

@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route("/remove_pdf", methods=["POST"])
def remove_pdf():
    data = request.get_json()
    filename = data.get("filename")
    pdfs = get_session_pdfs()
    if filename in pdfs:
        file_path = pdfs[filename]["path"]
        if os.path.exists(file_path):
            os.remove(file_path)
        pdfs.pop(filename)
        save_session_pdfs(pdfs)
        if "history" in session and filename in session["history"]:
            session["history"].pop(filename)
        return jsonify({"status": "ok", "pdf_names": list(pdfs.keys())})
    else:
        return jsonify({"status": "error", "message": "PDF not found"})

@app.route("/remove_all_pdfs", methods=["POST"])
def remove_all_pdfs():
    pdfs = get_session_pdfs()
    for pdf in pdfs.values():
        if os.path.exists(pdf["path"]):
            os.remove(pdf["path"])
    session["pdfs"] = {}
    session["history"] = {}
    return jsonify({"status": "ok", "pdf_names": []})

@app.route("/reset", methods=["POST"])
def reset():
    session.clear()
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(debug=True)
