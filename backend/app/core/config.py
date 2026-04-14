from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_KEY: str
    KAKAO_REST_API_KEY: str
    KAKAO_JS_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
