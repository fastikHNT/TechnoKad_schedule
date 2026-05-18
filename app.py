from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, flash
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import login_user, login_required, logout_user
from config import Config
from extensions import db, login_manager, mail

from models.user import User
from models.activation_token import ActivationToken

from services.token_service import generate_token
from services.email_service import send_activation_email

app = Flask(__name__)

app.config.from_object(Config)

db.init_app(app)
login_manager.init_app(app)
mail.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def authorization():
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():

    if request.method == 'POST':

        email = request.form.get('email')
        password = request.form.get('password')
        first_name = request.form.get('first_name')
        last_name = request.form.get('last_name')

        user = User.query.filter_by(email=email).first()

        if user and user.is_registered:
            flash(f"Пользователь с данным адресом электронной почты {email} уже зарегистрирован. Выполните авторизацию.")
            return redirect('/')

        password_hash = generate_password_hash(password)

        if not user:
            user = User(
                email=email,
                first_name=first_name,
                last_name=last_name,
                password_hash=password_hash
            )
            db.session.add(user)
            db.session.commit()
        else:
            user.first_name = first_name
            user.last_name = last_name
            user.password_hash = password_hash
            db.session.commit()

        # блокируем старые токены
        ActivationToken.query.filter_by(user_id=user.id, used=False).update({
            "used": True
        })
        db.session.commit()

        token = generate_token()

        ActivationToken.query.filter_by(user_id=user.id).delete()

        new_token = ActivationToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )

        db.session.add(new_token)
        db.session.commit()

        send_activation_email(email, token)

        flash(f"На указанный адрес электронной почты {email} было направлено письмо для активации учетной записи.", "success")

        return redirect('/')

    return render_template('login.html')

@app.route('/activate/<token>')
def activate(token):

    activation = ActivationToken.query.filter_by(token=token, used=False).first()

    if not activation:
        return "Ссылка недействительна"

    user = User.query.get(activation.user_id)

    user.is_registered = True
    activation.used = True

    db.session.commit()

    login_user(user)

    return redirect('/main')

@app.route('/login', methods=['POST'])
def login():

    email = request.form['email']
    password = request.form['password']

    user = User.query.filter_by(email=email).first()

    if not user or not user.is_registered:
        flash("Аккаунт не активирован")
        return redirect('/')

    if check_password_hash(user.password_hash, password):

        login_user(user)

        return redirect('/main')

    flash("Неверный пароль")

    return redirect('/')

@app.route('/main')
@login_required
def main():
    return render_template('main.html')

@app.route('/logout')
@login_required
def logout():

    logout_user()

    return redirect('/')

if __name__ == '__main__':
    app.run(debug=True)
